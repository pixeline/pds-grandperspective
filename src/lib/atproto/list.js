import { recordTime } from './tid.js';
import { audit } from './audit.js';

/** A collection cannot page forever; this bounds a pathological server. */
const MAX_PAGES_PER_COLLECTION = 4000;

/**
 * Fallback reader: describeRepo, then listRecords paged to exhaustion on every
 * collection.
 *
 * Used only when the CAR endpoint is unavailable. Read ORDER does not matter
 * here -- every collection is read completely either way -- which is why the
 * old fair round-robin is gone rather than merely unused. It existed to make
 * every collection present under a record ceiling, and there is no ceiling.
 *
 * Byte sizes on this path are JSON re-serialisation lengths, which run
 * 1.06x-1.14x larger than what the PDS stores and vary by collection. They are
 * therefore marked `exact: false` so the UI can say so.
 *
 * A record whose rkey is not a decodable TID and which carries no `createdAt`
 * is kept, with `ts: null` -- not dropped. On a live 186,974-record repo, 25
 * such records exist across 25 distinct collections, one each: singleton
 * `self`-keyed config records. Dropping them would erase 25 of ~195
 * collections from a map whose entire claim is that a cell's area is
 * proportional to the bytes it occupies.
 *
 * @param {string} pds
 * @param {string} did
 * @param {{signal?: AbortSignal, onProgress?: (msg: string, n: number) => void,
 *          now?: number, fetchImpl?: typeof fetch}} [opts]
 */
export async function listAllRecords(pds, did, opts = {}) {
	const { signal, onProgress, now = Date.now(), fetchImpl = fetch } = opts;

	const get = async (url) => {
		const r = await fetchImpl(url, { signal });
		if (!r.ok) throw new Error(`${r.status} from ${new URL(url).host}`);
		return r.json();
	};

	const desc = await get(
		`${pds}/xrpc/com.atproto.repo.describeRepo?repo=${encodeURIComponent(did)}`
	);
	const declared = (desc.collections || []).slice().sort();
	if (!declared.length) throw new Error('Repo is empty — no collections to read.');

	const records = [];
	// Built from records actually seen, not `declared` -- a collection describeRepo
	// lists but that turns out to hold zero records must not be counted, or the
	// same repo would report a different collection count depending on whether
	// this reader or car.js's walkRecords (which counts observed collections
	// only) produced it.
	const collections = new Set();

	for (const col of declared) {
		let cursor = null;
		for (let page = 0; page < MAX_PAGES_PER_COLLECTION; page++) {
			const url =
				`${pds}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(did)}` +
				`&collection=${encodeURIComponent(col)}&limit=100` +
				(cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
			const j = await get(url);

			for (const r of j.records || []) {
				const rkey = String(r.uri).split('/').pop();
				const { ts, tid } = recordTime(rkey, r.value, now);
				const errNames = audit(col, rkey, r.value, tid, now);
				records.push({
					col,
					ts,
					rkey,
					bytes: JSON.stringify(r.value ?? null).length,
					exact: false,
					errs: errNames.length,
					errNames,
					value: r.value
				});
				collections.add(col);
			}

			onProgress?.(`${records.length} records · ${col.split('.').pop()}`, records.length);
			cursor = j.cursor || null;
			if (!cursor) break;
		}
	}

	// An undated record (no decodable TID, no createdAt) is not known to be the
	// oldest thing in the repo -- sort it last, which claims nothing about its
	// position beyond "not placed among the dated ones".
	records.sort((a, b) => (a.ts ?? Infinity) - (b.ts ?? Infinity));
	return { records, collections: [...collections].sort() };
}
