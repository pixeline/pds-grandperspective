/**
 * The parameter set. Under the metadesign constraint these are the piece, not
 * documentation of it — so every one is exposed, named with its source, and
 * round-trips through the URL hash.
 */
export const PARAMS = [
	{ key: 'gap', label: 'Silence threshold', min: 5, max: 720, step: 5, def: 90,
	  src: 'defines where one session ends',
	  fmt: (v) => (v >= 60 ? `${(v / 60).toFixed(1)} h` : `${v} min`) },
	{ key: 'twist', label: 'Twist gain', min: 0, max: 40, step: 1, def: 16,
	  src: 'cadence → rotation per plate', fmt: (v) => `${v}°` },
	{ key: 'depth', label: 'Silence depth', min: 2, max: 90, step: 1, def: 28,
	  src: 'gap length → distance between plates', fmt: (v) => String(v) },
	{ key: 'decay', label: 'Decay', min: 0, max: 100, step: 1, def: 70,
	  src: 'how fast the past loses saturation', fmt: (v) => (v / 100).toFixed(2) },
	{ key: 'tiles', label: 'Depth limit', min: 10, max: 600, step: 10, def: 320,
	  src: 'most recent sessions drawn', fmt: (v) => String(v) },
	{ key: 'cap', label: 'Record ceiling', min: 500, max: 12000, step: 500, def: 4000,
	  src: 'how deep to read (raise it, redraw)', fmt: (v) => fmtNum(v) }
];

export function defaults() {
	return Object.fromEntries(PARAMS.map((p) => [p.key, p.def]));
}

/** @param {number} n */
export function fmtNum(n) {
	return n >= 1e4 ? `${(n / 1e3).toFixed(1)}k` : String(n);
}

/** @param {number} b */
export function fmtBytes(b) {
	if (b < 1024) return `${b} B`;
	if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
	return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

/** @param {number} ms */
export function fmtDur(ms) {
	const m = ms / 6e4;
	if (m < 1) return '<1 min';
	if (m < 90) return `${Math.round(m)} min`;
	const h = m / 60;
	if (h < 36) return `${h.toFixed(1)} h`;
	return `${(h / 24).toFixed(1)} d`;
}

/** @param {number} ms */
export function fmtDate(ms) {
	return new Date(ms).toISOString().replace('T', ' ').slice(0, 16);
}

/**
 * Full state in the hash, so any portrait is reproducible and shareable —
 * a requirement of the metadesign constraint, not a nicety.
 * @param {{handle:string,view:string,params:Record<string,number>,cam?:number,ax?:number,ay?:number}} s
 */
export function toHash({ handle, view, params, cam, ax, ay }) {
	const q = new URLSearchParams();
	q.set('v', view);
	if (handle) q.set('h', handle);
	for (const p of PARAMS) if (params[p.key] !== p.def) q.set(p.key, String(params[p.key]));
	if (cam != null) q.set('cam', Math.round(cam).toString());
	if (ax != null) q.set('ax', Math.round(ax).toString());
	if (ay != null) q.set('ay', Math.round(ay).toString());
	return `#${q.toString()}`;
}

/** @param {string} hash */
export function fromHash(hash) {
	const q = new URLSearchParams(hash.replace(/^#/, ''));
	const params = defaults();
	for (const p of PARAMS) {
		const v = q.get(p.key);
		if (v != null && Number.isFinite(+v)) params[p.key] = Math.min(p.max, Math.max(p.min, +v));
	}
	const view = q.get('v');
	const num = (k) => (q.get(k) != null && Number.isFinite(+q.get(k)) ? +q.get(k) : null);
	return {
		handle: q.get('h') || '',
		view: view === 'map' || view === 'stack' ? view : null,
		params,
		cam: num('cam'),
		ax: num('ax'),
		ay: num('ay')
	};
}
