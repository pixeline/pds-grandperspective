import { sessionize } from './sessionize.js';

/** Edge of one plate, in local px. The whole stack is expressed in these units. */
export const PLATE = 460;

/** Channel colours for a tear. Only ever drawn where a record is really invalid. */
const CHANNELS = ['#00E5FF', '#FF00A8', '#FFE500'];

/**
 * Slice-and-dice partition of the unit square: every collection gets a FIXED
 * cell whose area is its global share. Constant across every plate, so dwelling
 * in one lexicon becomes a vein running through the depth.
 * @param {Map<string,number>} shares
 * @returns {Map<string,{x:number,y:number,w:number,h:number}>}
 */
export function partition(shares) {
	const items = [...shares.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
	const cells = new Map();
	(function slice(list, x, y, w, h, horiz) {
		if (!list.length) return;
		if (list.length === 1) {
			cells.set(list[0][0], { x, y, w, h });
			return;
		}
		const total = list.reduce((s, i) => s + i[1], 0);
		let acc = 0;
		let cut = 1;
		for (let i = 0; i < list.length; i++) {
			acc += list[i][1];
			if (acc >= total / 2) {
				cut = i + 1;
				break;
			}
		}
		cut = Math.min(Math.max(cut, 1), list.length - 1);
		const f = list.slice(0, cut).reduce((s, i) => s + i[1], 0) / total;
		if (horiz) {
			slice(list.slice(0, cut), x, y, w * f, h, !horiz);
			slice(list.slice(cut), x + w * f, y, w * (1 - f), h, !horiz);
		} else {
			slice(list.slice(0, cut), x, y, w, h * f, !horiz);
			slice(list.slice(cut), x, y + h * f, w, h * (1 - f), !horiz);
		}
	})(items, 0, 0, 1, 1, true);
	return cells;
}

/**
 * Hue per collection: a golden-angle walk over NSIDs sorted alphabetically.
 * Deterministic, so the same repo always draws the same colours, and spread,
 * so neighbouring namespaces do not collide.
 * @param {string[]} cols
 */
export function hues(cols) {
	const m = new Map();
	cols
		.slice()
		.sort()
		.forEach((c, i) => m.set(c, (i * 137.507) % 360));
	return m;
}

/**
 * Everything that depends on the whole dataset rather than the parameters.
 * @param {Array<{col:string}>} records
 */
export function globalLayout(records) {
	const shares = new Map();
	for (const r of records) shares.set(r.col, (shares.get(r.col) || 0) + 1);
	return { shares, cells: partition(shares), hueOf: hues([...shares.keys()]) };
}

/**
 * Build the stack as plain data. No DOM, no CSS, no renderer assumptions —
 * a plate is numbers and a list of marks. This is the seam that lets the same
 * mapping drive CSS 3D today and something else later.
 *
 * @param {Array<any>} records sorted ascending by ts
 * @param {{gap:number,twist:number,depth:number,decay:number,tiles:number}} P
 * @param {{cells:Map<string,any>,hueOf:Map<string,number>}} g
 */
export function buildStack(records, P, g) {
	const sessions = sessionize(records, P.gap * 6e4);
	const shown = sessions.slice(-P.tiles);
	if (!shown.length) return { plates: [], stackDepth: 0, sessions, shown: 0 };

	const newest = records[records.length - 1].ts;
	const oldestShown = shown[0].start;
	const span = Math.max(newest - oldestShown, 1);
	const decay = P.decay / 100;

	const cadence = shown.map((s) => s.items.length / Math.max((s.end - s.start) / 6e4, 1));
	const cmax = Math.max(...cadence, 1e-9);
	const silences = shown.map((s) => s.silence);
	const smax = Math.max(...silences, 1);

	// twist accumulates forward through time…
	const twists = [];
	let tw = 0;
	for (let i = 0; i < shown.length; i++) {
		tw += (cadence[i] / cmax) * P.twist;
		twists.push(tw);
	}
	// …while depth is measured backwards from now, so the newest plate sits
	// where the viewer stands and the past recedes away from them. Separation
	// between two plates is the silence that actually lay between them.
	const zs = new Array(shown.length);
	for (let i = shown.length - 1, z = 0; i >= 0; i--) {
		zs[i] = z;
		z -= 6 + Math.pow(silences[i] / smax, 0.45) * P.depth;
	}

	const plates = shown.map((s, i) => {
		const age = (newest - s.start) / span; // 0 = now, 1 = oldest shown
		const life = Math.pow(1 - age, 1 + decay * 3); // recency weight
		const n = s.items.length;

		const local = new Map();
		const firstKey = new Map();
		for (const r of s.items) {
			local.set(r.col, (local.get(r.col) || 0) + 1);
			if (!firstKey.has(r.col)) firstKey.set(r.col, r.rkey);
		}

		const marks = [];

		// region: this collection's share within this session, in its fixed cell
		for (const [col, count] of local) {
			const c = g.cells.get(col);
			if (!c) continue;
			const fill = Math.sqrt(count / n);
			const w = c.w * PLATE * fill;
			const h = c.h * PLATE * fill;
			marks.push({
				kind: 'region',
				x: (c.x + c.w / 2) * PLATE - w / 2,
				y: (c.y + c.h / 2) * PLATE - h / 2,
				w,
				h,
				color: `hsl(${g.hueOf.get(col)} ${(18 + 72 * life).toFixed(0)}% ${(46 + 16 * age).toFixed(0)}%)`,
				col,
				rkey: firstKey.get(col) || '',
				count
			});
		}

		// transition: the in-between is the subject. Small squares stepping
		// between two cell centres, a Boogie-Woogie dashed run.
		let drawn = 0;
		for (let k = 1; k < s.items.length && drawn < 48; k++) {
			const a = s.items[k - 1];
			const b = s.items[k];
			if (a.col === b.col) continue;
			const ca = g.cells.get(a.col);
			const cb = g.cells.get(b.col);
			if (!ca || !cb) continue;
			const x1 = (ca.x + ca.w / 2) * PLATE;
			const y1 = (ca.y + ca.h / 2) * PLATE;
			const x2 = (cb.x + cb.w / 2) * PLATE;
			const y2 = (cb.y + cb.h / 2) * PLATE;
			const steps = 7;
			const sz = Math.max(3, 5 * life + 2);
			for (let t = 0; t < steps; t++) {
				const f = (t + 0.5) / steps;
				marks.push({
					kind: 'transition',
					x: x1 + (x2 - x1) * f - sz / 2,
					y: y1 + (y2 - y1) * f - sz / 2,
					w: sz,
					h: sz,
					color: `hsl(${g.hueOf.get(t % 2 ? b.col : a.col)} ${(30 + 60 * life).toFixed(0)}% ${(52 + 12 * age).toFixed(0)}%)`,
					from: a.col,
					to: b.col,
					col: b.col,
					rkey: b.rkey || ''
				});
			}
			drawn++;
		}

		// tear: channel split, only where a record is genuinely invalid
		for (const r of s.items) {
			if (!r.errs) continue;
			const c = g.cells.get(r.col);
			if (!c) continue;
			const off = 2 + r.errs * 3;
			const sz = Math.min(c.w, c.h) * PLATE * 0.34;
			CHANNELS.forEach((ch, j) => {
				marks.push({
					kind: 'tear',
					x: (c.x + c.w / 2) * PLATE - sz / 2 + (j - 1) * off,
					y: (c.y + c.h / 2) * PLATE - sz / 2 - (j - 1) * off * 0.6,
					w: sz,
					h: sz,
					color: ch,
					alpha: +(0.34 * life + 0.08).toFixed(3),
					col: r.col,
					rkey: r.rkey || '',
					err: (r.errNames || []).join(', ')
				});
			});
		}

		return {
			n: shown.length - i, // plate 1 is the newest
			of: shown.length,
			z: zs[i],
			twist: +twists[i].toFixed(2),
			alpha: +(0.12 + 0.88 * life).toFixed(3),
			start: s.start,
			end: s.end,
			records: n,
			silence: s.silence,
			cadence: cadence[i],
			errs: s.items.reduce((acc, r) => acc + (r.errs ? 1 : 0), 0),
			collections: local.size,
			top: [...local.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4),
			marks
		};
	});

	return {
		plates,
		stackDepth: zs.length ? zs[0] : 0,
		sessions,
		shown: shown.length
	};
}

/** Median records per session, for the measured panel. */
export function medianSession(sessions) {
	if (!sessions.length) return 0;
	const a = sessions.map((s) => s.items.length).sort((x, y) => x - y);
	return a[a.length >> 1];
}
