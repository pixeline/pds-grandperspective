// Import order is source order: this must run before @atproto/repo is
// evaluated so the global it needs already exists, not merely before we call
// into it.
import './buffer-shim.js';
import { readCarWithRoot, MemoryBlockstore, Repo } from '@atproto/repo';
import { recordTime } from './tid.js';
import { audit } from './audit.js';

/**
 * Yield one macrotask so the browser can paint, WITHOUT the background-tab
 * penalty. `setTimeout(0)` is clamped to >=1000ms in a hidden/blurred tab, so
 * using it to pace a long parse would turn a few-second read into minutes the
 * moment the user switches away. A `MessageChannel` message is a macrotask too
 * -- the browser can paint between them -- but is exempt from that clamp, so
 * the parse runs at full speed in the background and still animates in the
 * foreground. Falls back to `setTimeout` where MessageChannel is absent.
 *
 * @returns {Promise<void>}
 */
function yieldToEventLoop() {
	return new Promise((resolve) => {
		if (typeof MessageChannel === 'undefined') {
			setTimeout(resolve);
			return;
		}
		const ch = new MessageChannel();
		ch.port1.onmessage = () => {
			ch.port1.close();
			resolve();
		};
		ch.port2.postMessage(0);
	});
}

/**
 * `com.atproto.sync.getRepo` returns the complete repo -- every record, the MST
 * nodes, and the signed commit -- in one CAR file. It is deliberately
 * unauthenticated: repo content is public.
 *
 * @param {string} pds
 * @param {string} did
 */
export function carUrl(pds, did) {
	return `${pds}/xrpc/com.atproto.sync.getRepo?did=${encodeURIComponent(did)}`;
}

/**
 * Stream the CAR body, counting as it goes.
 *
 * getRepo responds with no Content-Length -- the body is chunked -- so the size
 * cannot be known before the download starts. Counting while streaming is the
 * only way to gate it, and it doubles as the progress signal the firehose shows.
 *
 * @param {string} url
 * @param {{signal?: AbortSignal, onProgress?: (bytes: number) => void,
 *          limitBytes?: number, onSizeGate?: (bytes: number) => Promise<boolean>,
 *          fetchImpl?: typeof fetch}} [opts]
 * @returns {Promise<Uint8Array>}
 */
export async function fetchCarBytes(url, opts = {}) {
	const { signal, onProgress, limitBytes = Infinity, onSizeGate, fetchImpl = fetch } = opts;

	const res = await fetchImpl(url, { signal });
	if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`);
	if (!res.body) throw new Error('response has no body to stream');

	const reader = res.body.getReader();
	const chunks = [];
	let total = 0;
	let limit = limitBytes;

	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
		total += value.length;
		onProgress?.(total);

		if (total > limit) {
			// ask, and honour the answer. Without a gate callback the limit is a
			// hard stop; with one, agreeing lifts it for the rest of this read.
			const proceed = onSizeGate ? await onSizeGate(total) : false;
			if (!proceed) {
				await reader.cancel();
				throw new Error('size-limit');
			}
			limit = Infinity;
		}
	}

	const out = new Uint8Array(total);
	let at = 0;
	for (const c of chunks) {
		out.set(c, at);
		at += c.length;
	}
	return out;
}

/**
 * Parse a repo CAR into the flat record array the rest of the app works in.
 *
 * `ReadableRepo` is not re-exported from @atproto/repo; `Repo` extends it and
 * inherits the static `load`. Each record's stored size is the length of its
 * DAG-CBOR block -- what the PDS actually holds -- rather than a re-serialised
 * JSON estimate.
 *
 * @param {Uint8Array} bytes
 * @param {{now?: number, onRecord?: (r: import('../repo/types.js').RepoRecord, n: number) => void}} [opts]
 * @returns {Promise<{did: string, rev: string, records: import('../repo/types.js').RepoRecord[], collections: string[]}>}
 */
export async function parseRepoCar(bytes, opts = {}) {
	const { now = Date.now(), onRecord } = opts;

	const { root, blocks } = await readCarWithRoot(bytes);
	const repo = await Repo.load(new MemoryBlockstore(blocks), root);

	const records = [];
	const collections = new Set();

	for await (const { collection, rkey, cid, record } of repo.walkRecords()) {
		const { ts, tid } = recordTime(rkey, record, now);
		const errNames = audit(collection, rkey, record, tid, now);
		const out = {
			col: collection,
			ts,
			rkey,
			bytes: blocks.get(cid)?.length ?? 0,
			exact: true,
			errs: errNames.length,
			errNames,
			value: record
		};
		records.push(out);
		collections.add(collection);
		onRecord?.(out, records.length);

		// Yield a real macrotask periodically. `walkRecords()` is otherwise one
		// long synchronous run: the `await` in `for await` only queues
		// microtasks, which drain *before* the browser paints, so the whole parse
		// renders zero frames -- the record counter sits still and the loader
		// never gets to show the colour of the lexicon streaming in. Yielding
		// every few thousand records lets a frame paint. It does not sample or
		// truncate: every record is still walked, measured, and kept.
		if (records.length % 2048 === 0) await yieldToEventLoop();
	}

	// An undated record (no decodable TID, no createdAt) is not known to be the
	// oldest thing in the repo -- sort it last, which claims nothing about its
	// position beyond "not placed among the dated ones".
	records.sort((a, b) => (a.ts ?? Infinity) - (b.ts ?? Infinity));
	return { did: repo.did, rev: repo.commit.rev, records, collections: [...collections].sort() };
}
