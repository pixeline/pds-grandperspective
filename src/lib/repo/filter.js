/**
 * Filtering, as pure data. No DOM, no renderer assumptions -- the treemap
 * re-lays out on whatever survives, so a filtered view is a smaller true map
 * rather than a dimmed version of a bigger one.
 */

/**
 * Does `nsid` sit at or under `sel`?
 *
 * Matching has to respect dot boundaries: `app.bsky` selects
 * `app.bsky.feed.like` but must NOT swallow `app.bskyfoo.thing`. A bare
 * `startsWith` gets this wrong and the mistake is invisible until someone owns
 * a namespace with a shared prefix.
 *
 * @param {string} nsid
 * @param {string} sel
 */
function underNamespace(nsid, sel) {
	return nsid === sel || nsid.startsWith(`${sel}.`);
}

/**
 * @param {Array<any>} records
 * @param {{collections: Set<string>, from: number|null, to: number|null, query: string}} f
 */
export function applyFilters(records, f) {
	const { collections, from, to, query } = f;
	const q = (query ?? '').trim().toLowerCase();
	const byCol = collections && collections.size > 0;

	const out = [];
	let bytes = 0;
	let totalBytes = 0;

	for (const r of records) {
		totalBytes += r.bytes || 0;

		if (byCol && ![...collections].some((sel) => underNamespace(r.col, sel))) continue;

		// An undated record -- no decodable TID, no createdAt -- cannot be shown
		// to fall inside a requested range, so any bound excludes it. Testing
		// `r.ts` directly would coerce null to 0: `null < from` is true (excluded)
		// but `null > to` is false (INCLUDED), so a to-only filter would silently
		// keep records it cannot place.
		if ((from != null || to != null) && r.ts == null) continue;
		if (from != null && r.ts < from) continue;
		if (to != null && r.ts > to) continue;

		if (q) {
			const hay = `${r.col} ${r.rkey} ${r.value ? JSON.stringify(r.value) : ''}`.toLowerCase();
			if (!hay.includes(q)) continue;
		}

		out.push(r);
		bytes += r.bytes || 0;
	}

	return { records: out, matched: out.length, total: records.length, bytes, totalBytes };
}
