/**
 * Resolve a hittest.js hit into the full record RecordModal needs.
 *
 * hittest.js deliberately stays display-shaped -- it never carries `value`,
 * only enough (`col` + `rkey`) to look the record up. RecordModal reads
 * `record.value` in four places: the JSON pane, the edit textarea, the
 * `$type` immutability guard in write.js (which computes `before` from
 * `record.value.$type` -- a hit handed to it verbatim always has that as
 * `undefined`, defeating the guard silently), and the claimed-`createdAt`
 * vs. TID skew check. A hit that never passes through this function reaches
 * the modal with `value` missing and every one of those goes wrong at once.
 *
 * An aggregate hit has no single record behind it -- it stands for a whole
 * block too small to resolve to individual cells -- and must pass through
 * unchanged rather than be looked up.
 *
 * @param {import('./types.js').Hit | null} hit a hit from hittest.js (or the
 *   keyboard-focus equivalent built in Treemap.svelte's buildFlatCells, same
 *   shape)
 * @param {import('./types.js').RepoRecord[]} records the full record set the
 *   hit was drawn from
 * @returns {import('./types.js').ModalRecord | null} the hit, with `value`
 *   (and the record's own `exact` flag) attached when a matching record is
 *   found; the aggregate hit or a hit with no matching record is returned
 *   unchanged
 */
export function resolveHit(hit, records) {
	if (!hit || hit.aggregate) return hit;
	const record = records.find((r) => r.col === hit.col && r.rkey === hit.rkey);
	// Always return a fresh object literal with a `value` key present (even
	// when no record matched, which should not happen in practice) rather
	// than the bare hit -- `value` is a REQUIRED field of the non-aggregate
	// half of ModalRecord, and returning the hit unchanged in that branch
	// would be exactly the shape Critical 1 was about.
	return { ...hit, value: record?.value, exact: record?.exact };
}
