/**
 * The viewable state lives in the hash, so a filtered view is shareable.
 *
 * The stack keys (v, gap, twist, depth, decay, tiles, cam, ax, ay) and the
 * record ceiling (cap) are gone. An old URL carrying them still resolves --
 * they are simply ignored rather than restored.
 */

export function defaultState() {
	return {
		handle: '',
		weigh: 'bytes',
		collections: new Set(),
		from: null,
		to: null,
		query: ''
	};
}

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

/** @param {ReturnType<typeof defaultState>} s */
export function toHash(s) {
	const q = new URLSearchParams();
	if (s.handle) q.set('h', s.handle);
	if (s.weigh && s.weigh !== 'bytes') q.set('weigh', s.weigh);
	if (s.collections?.size) q.set('c', [...s.collections].sort().join(','));
	if (s.from != null) q.set('from', isoDay(s.from));
	if (s.to != null) q.set('to', isoDay(s.to));
	if (s.query?.trim()) q.set('q', s.query.trim());
	return `#${q.toString()}`;
}

/** @param {string} hash */
export function fromHash(hash) {
	const q = new URLSearchParams(String(hash ?? '').replace(/^#/, ''));
	const s = defaultState();

	s.handle = q.get('h') || '';
	if (q.get('weigh') === 'records') s.weigh = 'records';

	const cols = q.get('c');
	if (cols) s.collections = new Set(cols.split(',').filter(Boolean));

	for (const k of /** @type {const} */ (['from', 'to'])) {
		const raw = q.get(k);
		if (!raw) continue;
		const ms = Date.parse(raw);
		if (Number.isFinite(ms)) s[k] = ms;
	}

	s.query = q.get('q') || '';
	return s;
}
