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
