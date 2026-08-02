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
 * Per-record search haystack, memoised by record identity.
 *
 * A `WeakMap` keyed on the record object lets each record pay for its own
 * `JSON.stringify` at most once, without mutating the record (the rest of the
 * app reads these objects) and without leaking when a new read replaces the
 * array wholesale -- the old records become unreachable and the WeakMap
 * entries collect with them.
 *
 * This is computed lazily, on first search, not during the read: most users
 * never type a query, and eagerly stringifying every record up front would
 * just move the 187k-JSON.stringify cost from "per keystroke" to "per read"
 * rather than removing it.
 *
 * Semantics are intentionally non-revalidating: once a record's haystack is
 * cached, later mutations to `r.value` are NOT reflected -- the cached text
 * from the first search wins. That is safe here because records are replaced
 * wholesale after a write (see read.js), never mutated in place, so a stale
 * cache entry is unreachable in practice. If that invariant ever changes,
 * this cache would need to key on something other than object identity.
 *
 * @type {WeakMap<object, string>}
 */
const haystackCache = new WeakMap();

/**
 * @param {any} r
 * @returns {string}
 */
function haystackOf(r) {
	let hay = haystackCache.get(r);
	if (hay === undefined) {
		hay = `${r.col} ${r.rkey} ${r.value ? JSON.stringify(r.value) : ''}`.toLowerCase();
		haystackCache.set(r, hay);
	}
	return hay;
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
			if (!haystackOf(r).includes(q)) continue;
		}

		out.push(r);
		bytes += r.bytes || 0;
	}

	return { records: out, matched: out.length, total: records.length, bytes, totalBytes };
}
