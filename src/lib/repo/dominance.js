/**
 * Auto-hide selection for a collection that dominates the treemap.
 *
 * A single collection occupying most of a repo's stored bytes crowds out
 * everything else on screen: on the repo that motivated this,
 * `app.bsky.feed.like` was 89% of stored bytes, and the rest of a
 * 195-collection repo was reduced to a sliver. This is deliberately generic
 * -- it names no collection. Any repo can have one dominant collection; a
 * rule hard-coded to `app.bsky.feed.like` would help exactly one repo shape
 * while pretending to be general.
 *
 * Pure data in, data out -- no DOM, no Svelte, no side effects -- so it is
 * one honest function to test, and the caller (+page.svelte) decides what to
 * do with the answer (add it to `filters.hidden`, once, at read completion).
 */

/**
 * The share of total bytes a collection must exceed to be judged "dominant"
 * enough to auto-hide.
 *
 * Bytes, not record count: squarify (treemap.js) allocates screen area in
 * proportion to bytes when weighing by bytes (the default), so bytes is what
 * actually decides how much of the map one collection occupies -- a
 * collection with a million tiny records and one with a handful of huge ones
 * can occupy the same screen space, and only the byte share predicts that.
 *
 * 50%, not some smaller share: this is a one-shot convenience for the single
 * collection that would otherwise occupy *most* of the screen, not a general
 * "large things are suspicious" heuristic. Below half, at least as much of
 * the map is everything else, and the user already sees plenty without help.
 * Strictly greater-than, not greater-or-equal, so a tie at exactly the
 * threshold is not treated as dominance.
 */
export const DOMINANCE_THRESHOLD = 0.5;

/**
 * @param {Array<{col: string, bytes?: number}>} records
 * @returns {string|null} the one collection whose share of total bytes
 *   exceeds {@link DOMINANCE_THRESHOLD}, or `null` if none does -- including
 *   for an empty record set. Total and never throws: because the threshold
 *   is a strict majority, at most one collection can ever qualify, so this
 *   always resolves to exactly one collection or none, never a choice among
 *   several.
 */
export function selectDominantCollection(records) {
	if (!records || !records.length) return null;

	/** @type {Map<string, number>} */
	const bytesByCol = new Map();
	let total = 0;
	for (const r of records) {
		const bytes = r.bytes || 0;
		total += bytes;
		bytesByCol.set(r.col, (bytesByCol.get(r.col) || 0) + bytes);
	}
	if (total <= 0) return null;

	let bestCol = null;
	let bestBytes = -1;
	for (const [col, bytes] of bytesByCol) {
		if (bytes > bestBytes) {
			bestBytes = bytes;
			bestCol = col;
		}
	}

	return bestCol != null && bestBytes / total > DOMINANCE_THRESHOLD ? bestCol : null;
}
