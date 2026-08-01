/**
 * Group records into sessions: runs of activity bounded by silence.
 * @param {Array<{ts:number}>} records sorted ascending by ts
 * @param {number} gapMs silence threshold
 */
export function sessionize(records, gapMs) {
	const out = [];
	let cur = null;
	let prevEnd = null;
	for (const r of records) {
		if (!cur || r.ts - cur.end > gapMs) {
			if (cur) out.push(cur);
			cur = {
				start: r.ts,
				end: r.ts,
				items: [r],
				silence: prevEnd == null ? 0 : r.ts - prevEnd
			};
		} else {
			cur.end = r.ts;
			cur.items.push(r);
		}
		prevEnd = cur.end;
	}
	if (cur) out.push(cur);
	return out;
}

/**
 * The silence threshold that lets a whole history fit inside `tiles` plates.
 * Deriving it from the gap distribution rather than a fixed guess means the
 * default portrait shows the full life on both sparse and hyperactive repos.
 * @param {Array<{ts:number}>} records
 * @param {number} tiles depth limit
 * @returns {number} minutes, clamped to session sanity
 */
export function suggestGapMinutes(records, tiles) {
	const gaps = [];
	for (let i = 1; i < records.length; i++) gaps.push(records[i].ts - records[i - 1].ts);
	if (!gaps.length) return 90;
	gaps.sort((a, b) => a - b);
	const median = gaps[gaps.length >> 1] || 6e5;
	const fit = gaps.length >= tiles ? gaps[gaps.length - tiles] : median * 10;
	return Math.round(Math.min(720, Math.max(15, fit / 6e4)) / 5) * 5;
}
