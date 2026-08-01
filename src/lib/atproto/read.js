import { jget, resolveIdentity } from './identity.js';
import { recordTime } from './tid.js';
import { audit } from './audit.js';

const PAGE_ROUNDS = 80;
const LANES = 6;

/**
 * Read every collection in a repo.
 *
 * Fair reading matters more than it looks: a sequential scan lets one huge
 * collection (likes, usually, because `app.bsky.*` sorts early) consume the
 * whole record ceiling before the rest are touched. On a real repo that drew
 * 4000 likes and left 181 collections unread. So:
 *   pass 1 samples EVERY collection with a small page, so each one is present;
 *   pass 2 round-robins full pages among the unfinished until the cap.
 *
 * @param {string} input handle or DID
 * @param {number} cap record ceiling
 * @param {AbortSignal} signal
 * @param {(msg:string)=>void} onProgress
 */
export async function readRepo(input, cap, signal, onProgress) {
	onProgress('resolving identity');
	const { did, pds } = await resolveIdentity(input, signal);

	onProgress(`reading ${new URL(pds).host}`);
	const desc = await jget(
		`${pds}/xrpc/com.atproto.repo.describeRepo?repo=${encodeURIComponent(did)}`,
		signal
	);
	const collections = (desc.collections || []).slice().sort();
	if (!collections.length) throw new Error('Repo is empty — no collections to read.');

	const records = [];
	const errorTally = new Map();
	const state = collections.map((col) => ({ col, cursor: null, done: false }));

	async function fetchPage(st, limit) {
		const u =
			`${pds}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(did)}` +
			`&collection=${encodeURIComponent(st.col)}&limit=${limit}` +
			(st.cursor ? `&cursor=${encodeURIComponent(st.cursor)}` : '');
		const j = await jget(u, signal);
		for (const r of j.records || []) {
			const rkey = String(r.uri).split('/').pop();
			const { ts, tid } = recordTime(rkey, r.value);
			if (ts == null) continue;
			const errNames = audit(st.col, rkey, r.value, tid);
			for (const e of errNames) errorTally.set(e, (errorTally.get(e) || 0) + 1);
			records.push({
				col: st.col,
				ts,
				rkey,
				errs: errNames.length,
				errNames,
				// byte weight of the record as stored, so the survey can size by
				// what the repo actually costs rather than by record count alone
				bytes: JSON.stringify(r.value ?? null).length
			});
		}
		st.cursor = j.cursor || null;
		if (!st.cursor) st.done = true;
	}

	// pass 1 — breadth, so no collection is invisible
	const firstLimit = Math.max(10, Math.min(100, Math.ceil(cap / collections.length)));
	let next = 0;
	await Promise.all(
		Array.from({ length: LANES }, async () => {
			for (;;) {
				const i = next++;
				if (i >= state.length || records.length >= cap) return;
				await fetchPage(state[i], firstLimit);
				onProgress(
					`${records.length} records · sampled ${Math.min(i + 1, state.length)}/${state.length} collections`
				);
			}
		})
	);

	// pass 2 — depth, shared fairly among whatever is left
	let rounds = 0;
	while (records.length < cap && state.some((s) => !s.done) && rounds < PAGE_ROUNDS) {
		for (const st of state) {
			if (st.done || records.length >= cap) continue;
			await fetchPage(st, 100);
			onProgress(`${records.length} records · deepening ${st.col.split('.').pop()}`);
		}
		rounds++;
	}

	records.sort((a, b) => a.ts - b.ts);
	return { did, pds, collections, records, errorTally, truncated: records.length >= cap };
}
