const B32 = '234567abcdefghijklmnopqrstuvwxyz';

/** Earliest plausible atproto timestamp (2005-01-01), used to reject garbage. */
const FLOOR = 1104537600000;

/**
 * Decode a TID record key to milliseconds.
 * The TID is assigned by the server, so it is the more trustworthy of the two
 * clocks available on a record; `createdAt` is whatever the client claimed.
 * @param {string} rkey
 * @param {number} [now] injectable clock, so tests do not depend on today
 * @returns {number|null} ms, or null when the rkey is not a decodable TID
 */
export function tidToMs(rkey, now = Date.now()) {
	if (typeof rkey !== 'string' || rkey.length !== 13) return null;
	let n = 0n;
	for (const c of rkey) {
		const i = B32.indexOf(c);
		if (i < 0) return null;
		n = n * 32n + BigInt(i);
	}
	const ms = Number((n >> 10n) / 1000n);
	return ms > FLOOR && ms < now + 864e5 ? ms : null;
}

/**
 * The timestamp a record is drawn at: TID first, claimed createdAt second.
 * @param {string} rkey
 * @param {unknown} value
 * @param {number} [now]
 */
export function recordTime(rkey, value, now = Date.now()) {
	const tid = tidToMs(rkey, now);
	if (tid != null) return { ts: tid, tid, source: 'tid' };
	const claimed =
		value && typeof value === 'object' && /** @type {any} */ (value).createdAt
			? Date.parse(/** @type {any} */ (value).createdAt)
			: NaN;
	if (Number.isFinite(claimed)) return { ts: claimed, tid: null, source: 'createdAt' };
	return { ts: null, tid: null, source: null };
}
