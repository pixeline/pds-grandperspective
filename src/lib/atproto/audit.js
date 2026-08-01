const ENC = new TextEncoder();

/**
 * Rules that hold for ANY atproto record, whatever lexicon governs it.
 * @param {string} col
 * @param {any} val
 * @param {number|null} tid
 * @param {number} now
 */
function universalRules(col, val, tid, now) {
	const errs = [];
	if (val.$type && val.$type !== col) errs.push('$type ≠ collection');

	const claimed = val.createdAt != null ? Date.parse(val.createdAt) : null;
	if (val.createdAt != null && Number.isNaN(claimed)) errs.push('unparseable createdAt');
	else if (claimed != null && claimed > now + 36e5) errs.push('createdAt in the future');
	else if (claimed != null && tid != null && Math.abs(tid - claimed) > 864e5)
		errs.push('clock skew > 24h');

	// facets index byte offsets into their own text: broken in any lexicon
	if (typeof val.text === 'string' && Array.isArray(val.facets)) {
		const len = ENC.encode(val.text).length;
		for (const f of val.facets) {
			const i = (f && f.index) || {};
			if (!(i.byteStart >= 0) || !(i.byteEnd <= len) || i.byteStart > i.byteEnd) {
				errs.push('facet byte range outside text');
				break;
			}
		}
	}

	const imgs = val.embed && val.embed.images;
	if (Array.isArray(imgs) && imgs.some((im) => !im || !im.image || !im.image.mimeType))
		errs.push('blob without mimeType');

	return errs;
}

/**
 * Rules a specific lexicon defines, applied only where that lexicon governs.
 *
 * A required top-level `createdAt`, the 300-grapheme ceiling and the reply
 * root/parent pair are app.bsky's contract, not the network's. Other lexicons
 * never agreed to them: `site.standard.document` is a long document by design,
 * and `my.skylights.rel` keeps its timestamps inside sub-objects. Judging those
 * by Bluesky's schema tears the plate where the auditor is wrong, not the data —
 * which would violate the "glitch only from real errors" constraint.
 * @param {string} col
 * @param {string} rkey
 * @param {any} val
 */
function lexiconRules(col, rkey, val) {
	const errs = [];
	if (!col.startsWith('app.bsky.')) return errs;

	if (val.createdAt == null && rkey !== 'self') errs.push('no createdAt');
	if (col === 'app.bsky.feed.post') {
		if (typeof val.text === 'string' && [...val.text].length > 300)
			errs.push('text over 300 graphemes');
		if (val.reply && !(val.reply.root && val.reply.parent))
			errs.push('reply missing root or parent');
	}
	return errs;
}

/**
 * The error taxonomy. Returns the names of every rule this record breaks.
 * @param {string} col collection NSID
 * @param {string} rkey record key
 * @param {any} val record value
 * @param {number|null} tid decoded TID time, or null
 * @param {number} [now]
 * @returns {string[]}
 */
export function audit(col, rkey, val, tid, now = Date.now()) {
	if (!val || typeof val !== 'object') return ['empty value'];
	return [...universalRules(col, val, tid, now), ...lexiconRules(col, rkey, val)];
}
