/**
 * GrandPerspective view: the repo as occupied space rather than elapsed time.
 * Nesting follows the NSID itself (app → bsky → feed → like), so the namespaces
 * a repo dwells in become visible blocks, and one cell is one record.
 */

/**
 * @param {Map<string,number>} weights nsid → weight
 */
export function nsidTree(weights) {
	const root = { seg: '', kids: new Map(), n: 0, nsid: null };
	for (const [nsid, n] of weights) {
		root.n += n;
		let node = root;
		const segs = nsid.split('.');
		segs.forEach((s, i) => {
			if (!node.kids.has(s)) node.kids.set(s, { seg: s, kids: new Map(), n: 0, nsid: null });
			node = node.kids.get(s);
			node.n += n;
			if (i === segs.length - 1) node.nsid = nsid;
		});
	}
	return root;
}

/**
 * Squarified treemap (Bruls/Huizing/van Wijk): grow a row while the worst
 * aspect ratio keeps improving. Slice-and-dice would render the long tail of
 * one-record collections as unreadable sub-pixel slivers; this keeps them chunky.
 */
function squarify(items, x, y, w, h, out) {
	let i = 0;
	while (i < items.length && w > 0 && h > 0) {
		let remain = 0;
		for (let k = i; k < items.length; k++) remain += items[k].n;
		if (remain <= 0) break;

		const short = Math.min(w, h);
		const scale = (w * h) / remain;
		let sum = 0;
		let best = Infinity;
		let j = i;
		for (let k = i; k < items.length; k++) {
			const s = sum + items[k].n;
			const len = (s * scale) / short;
			let worst = 0;
			for (let m = i; m <= k; m++) {
				const side = (items[m].n * scale) / len;
				if (side > 0 && len > 0) worst = Math.max(worst, Math.max(len / side, side / len));
			}
			if (worst > best && k > i) break;
			best = worst;
			sum = s;
			j = k;
		}

		const len = (sum * scale) / short;
		let off = 0;
		for (let m = i; m <= j; m++) {
			const side = (items[m].n * scale) / len;
			if (w >= h) out.push({ node: items[m].node, x, y: y + off, w: len, h: side });
			else out.push({ node: items[m].node, x: x + off, y, w: side, h: len });
			off += side;
		}
		if (w >= h) {
			x += len;
			w -= len;
		} else {
			y += len;
			h -= len;
		}
		i = j + 1;
	}
}

function layoutNode(node, x, y, w, h, out) {
	const kids = [...node.kids.values()];
	// a collection can also be a parent (…beacon and …beacon.like): its own
	// records become a sibling leaf rather than vanishing into the block
	if (node.nsid) {
		const own = node.n - kids.reduce((s, k) => s + k.n, 0);
		if (own > 0) kids.push({ seg: node.seg, kids: new Map(), n: own, nsid: node.nsid });
	}
	if (!kids.length) {
		out.push({ node, x, y, w, h });
		return;
	}
	kids.sort((a, b) => b.n - a.n || String(a.seg).localeCompare(String(b.seg)));
	const rects = [];
	squarify(
		kids.map((k) => ({ n: k.n, node: k })),
		x,
		y,
		w,
		h,
		rects
	);
	for (const R of rects) {
		const p = Math.min(2, Math.min(R.w, R.h) / 8);
		const ix = R.x + p;
		const iy = R.y + p;
		const iw = Math.max(0, R.w - 2 * p);
		const ih = Math.max(0, R.h - 2 * p);
		if (R.node.kids.size) layoutNode(R.node, ix, iy, iw, ih, out);
		else out.push({ node: R.node, x: ix, y: iy, w: iw, h: ih });
	}
}

/**
 * @param {Array<any>} records
 * @param {{w:number,h:number,weigh:'bytes'|'records',hueOf:Map<string,number>}} opts
 */
export function buildTreemap(records, { w, h, weigh, hueOf }) {
	const weights = new Map();
	const byCol = new Map();
	for (const r of records) {
		const wt = weigh === 'bytes' ? r.bytes || 1 : 1;
		weights.set(r.col, (weights.get(r.col) || 0) + wt);
		if (!byCol.has(r.col)) byCol.set(r.col, []);
		byCol.get(r.col).push(r);
	}
	for (const a of byCol.values()) a.sort((p, q) => p.ts - q.ts);

	const leaves = [];
	layoutNode(nsidTree(weights), 0, 0, w, h, leaves);

	const newest = records.length ? records[records.length - 1].ts : Date.now();
	const span = Math.max(newest - (records.length ? records[0].ts : newest), 1);

	const blocks = [];
	let cells = 0;
	let aggregated = 0;

	for (const L of leaves) {
		if (L.w < 1 || L.h < 1) continue;
		const nsid = L.node.nsid;
		if (!nsid) continue; // empty repo: root leaf carries no collection, draw nothing
		const recs = byCol.get(nsid) || [];
		const n = recs.length;
		const hue = hueOf.get(nsid) ?? 0;

		const cols = Math.max(1, Math.round(Math.sqrt((n * L.w) / Math.max(L.h, 1))));
		const rows = Math.max(1, Math.ceil(n / cols));
		const cw = L.w / cols;
		const ch = L.h / rows;

		const block = {
			nsid,
			x: L.x,
			y: L.y,
			w: L.w,
			h: L.h,
			hue,
			records: n,
			bytes: recs.reduce((s, r) => s + (r.bytes || 0), 0),
			label: L.w > 54 && L.h > 15 ? `${nsid.split('.').slice(-2).join('.')} · ${n}` : null,
			cells: [],
			aggregate: false
		};

		if (n && cw >= 2.5 && ch >= 2.5) {
			recs.forEach((r, i) => {
				const age = (newest - r.ts) / span;
				block.cells.push({
					x: (i % cols) * cw,
					y: Math.floor(i / cols) * ch,
					w: Math.max(1, cw - 1),
					h: Math.max(1, ch - 1),
					color: `hsl(${hue} ${(20 + 70 * (1 - age)).toFixed(0)}% ${(44 + 18 * age).toFixed(0)}%)`,
					col: r.col,
					rkey: r.rkey,
					ts: r.ts,
					bytes: r.bytes,
					err: r.errs ? (r.errNames || []).join(', ') : ''
				});
				cells++;
			});
		} else if (n) {
			// too small to resolve one record per cell: say so, do not fake it
			block.aggregate = true;
			block.rkey = recs[recs.length - 1].rkey;
			block.color = `hsl(${hue} 58% 52%)`;
			aggregated++;
		}
		blocks.push(block);
	}

	return { blocks, leaves: leaves.length, cells, aggregated };
}
