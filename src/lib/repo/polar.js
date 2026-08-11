/**
 * Geometry for the behavioural polar chart. Pure: counts in, plain coordinates
 * out — no DOM, no context. Mirrors treemap.js so the painter and a future PNG
 * export stay leaf changes.
 */
import { RAY_ORDER } from './behavior.js';

/** Behaviour identity hues: golden-angle over the ray order — the same stable,
 *  well-separated technique hues.js uses for collections. */
export const RAYS = RAY_ORDER.map((key, i) => ({
	key,
	label: key[0].toUpperCase() + key.slice(1),
	hue: (i * 137.507) % 360
}));

const LOG_MAX = Math.log10(10000); // the edge is 10k records

/** count → 0..1 radius fraction on a fixed log scale (shared across accounts).
 *  Uses log10(count) directly (not count+1) so that the labelled rings sit at exact
 *  quarter-radii: 10→0.25, 100→0.5, 1000→0.75, 10000→1. The honest consequence is
 *  that a single record (count===1, log10(1)=0) plots at dead centre, same as zero.
 *  This is typical: nearly every account has exactly one app.bsky.actor.profile. */
export function radiusFraction(count) {
	if (count === 0) return 0;
	const f = Math.log10(count) / LOG_MAX;
	return f > 1 ? 1 : f;
}

export const SAT_HALF_LIFE_DAYS = 180;
const DAY = 86400000;

/** recency → 0..1 saturation. Active now → vivid; dormant → grey; never → 0.
 *  The half-life, not the exact number, is the load-bearing decision. */
export function raySaturation(ts, now) {
	if (ts == null) return 0;
	const ageDays = Math.max(0, (now - ts) / DAY);
	return Math.pow(0.5, ageDays / SAT_HALF_LIFE_DAYS);
}

const RINGS = [
	{ count: 10, label: '10' },
	{ count: 100, label: '100' },
	{ count: 1000, label: '1k' },
	{ count: 10000, label: '10k' }
];

/**
 * @param {ReturnType<import('./behavior.js').behaviorVector>} vector
 * @param {{size?: number, pad?: number, now?: number}} [opts]
 */
export function polarLayout(vector, opts = {}) {
	const size = opts.size ?? 220;
	const pad = opts.pad ?? 22;
	const now = opts.now ?? Date.now();
	const cx = size / 2;
	const cy = size / 2;
	const R = size / 2 - pad;
	const step = (2 * Math.PI) / RAY_ORDER.length;
	const angleOf = (i) => -Math.PI / 2 + i * step; // Create straight up, clockwise

	const axes = RAYS.map((ray, i) => {
		const a = angleOf(i);
		const count = vector[ray.key];
		const rFrac = radiusFraction(count);
		const r = R * rFrac;
		return {
			key: ray.key,
			label: ray.label,
			angle: a,
			count,
			rFrac,
			x: cx + R * Math.cos(a), // outer end of the spoke
			y: cy + R * Math.sin(a),
			px: cx + r * Math.cos(a), // plotted data point
			py: cy + r * Math.sin(a),
			hue: ray.hue,
			sat: raySaturation(vector.lastActive[ray.key], now)
		};
	});

	// The outermost ring is a clamp, not a ceiling: a count over 10k still plots
	// at the edge (radiusFraction clamps rFrac to 1), so the '10k' label alone
	// would understate it. Flag the ring honestly when that's happened.
	const clamped = RAY_ORDER.some((key) => vector[key] > 10000);

	return {
		size,
		center: { x: cx, y: cy },
		radius: R,
		rings: RINGS.map((ring) => ({
			r: R * radiusFraction(ring.count),
			label: ring.count === 10000 && clamped ? '10k+' : ring.label
		})),
		axes,
		polygon: axes.map((a) => ({ x: a.px, y: a.py }))
	};
}
