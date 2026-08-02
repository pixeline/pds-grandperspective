/**
 * Pointer → record, for the canvas renderer.
 *
 * The DOM gave this for free: one button per record, and the browser did the
 * hit testing. Canvas has no DOM, so a bug here opens the WRONG record in a
 * modal that can delete it. Hence a uniform grid index and real tests.
 *
 * Cell coordinates from buildTreemap are relative to their block; this index
 * stores absolute rectangles so lookup is a single comparison.
 */

const DEFAULT_CELL = 32;

/**
 * @param {Array<any>} blocks from buildTreemap
 * @param {number} w canvas width
 * @param {number} h canvas height
 * @param {number} [cellSize] grid bucket edge, in px
 */
export function buildIndex(blocks, w, h, cellSize = DEFAULT_CELL) {
	const cols = Math.max(1, Math.ceil(w / cellSize));
	const rows = Math.max(1, Math.ceil(h / cellSize));
	/** @type {Array<Array<any>>} */
	const buckets = Array.from({ length: cols * rows }, () => []);

	const put = (rect) => {
		const x0 = Math.max(0, Math.floor(rect.x / cellSize));
		const x1 = Math.min(cols - 1, Math.floor((rect.x + rect.w) / cellSize));
		const y0 = Math.max(0, Math.floor(rect.y / cellSize));
		const y1 = Math.min(rows - 1, Math.floor((rect.y + rect.h) / cellSize));
		for (let gy = y0; gy <= y1; gy++) {
			for (let gx = x0; gx <= x1; gx++) buckets[gy * cols + gx].push(rect);
		}
	};

	for (const b of blocks) {
		if (b.aggregate || !b.cells?.length) {
			put({
				x: b.x, y: b.y, w: b.w, h: b.h,
				hit: {
					nsid: b.nsid, col: b.nsid, rkey: b.rkey ?? null,
					records: b.records, bytes: b.bytes, aggregate: true
				}
			});
			continue;
		}
		for (const c of b.cells) {
			// treemap.js draws each cell inset (c.w/c.h = pitch - 1px) so cells look
			// visually separated, but that leaves the 1px gap dead to the pointer.
			// Hit test at the full pitch instead, so the grid tiles the block with
			// no gap; clamp the last column/row so the rect never runs past the
			// block's own bounds. Cells are squarified (variable size, §Important 2),
			// so the pitch is per-cell (c.pitchW/c.pitchH), not a uniform block-wide value.
			const ax = b.x + c.x;
			const ay = b.y + c.y;
			const aw = Math.min(c.pitchW, b.x + b.w - ax);
			const ah = Math.min(c.pitchH, b.y + b.h - ay);
			put({
				x: ax, y: ay, w: aw, h: ah,
				hit: {
					nsid: b.nsid, col: c.col, rkey: c.rkey, ts: c.ts,
					bytes: c.bytes, err: c.err, undated: c.undated, aggregate: false
				}
			});
		}
	}

	return { buckets, cols, rows, cellSize, w, h };
}

/**
 * @param {ReturnType<typeof buildIndex>} index
 * @param {number} x
 * @param {number} y
 * @returns {import('./types.js').Hit | null}
 */
export function hitTest(index, x, y) {
	if (x < 0 || y < 0 || x > index.w || y > index.h) return null;

	const gx = Math.min(index.cols - 1, Math.floor(x / index.cellSize));
	const gy = Math.min(index.rows - 1, Math.floor(y / index.cellSize));
	if (gx < 0 || gy < 0) return null;

	const bucket = index.buckets[gy * index.cols + gx];
	if (!bucket) return null;

	// a bucket can hold several candidate rectangles (it straddles more than
	// one cell/block), so scan them all and keep the last that actually
	// contains the point rather than trusting the first match
	let found = null;
	for (const r of bucket) {
		if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) found = r.hit;
	}
	return found;
}
