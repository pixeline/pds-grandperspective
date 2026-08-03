/**
 * Map a record's collection NSID to the app that owns its lexicon, and to a
 * URL for viewing that record on that app.
 *
 * atproto lexicons are reverse-DNS: the owning app's domain is the first two
 * NSID segments, reversed. `app.bsky.feed.post` -> `bsky.app`,
 * `sh.tangled.repo` -> `tangled.sh`. Measured against a real 196-collection
 * repository: 81 distinct roots, 70 of them (86%) resolve at HTTP 200 -- the
 * convention holds well enough to build a button on.
 *
 * `atstore.fyi` was considered and rejected as a lexicon->app registry: it
 * has no such mapping, and the data it does have answers a different
 * question ("which apps *read* this type", e.g. 43 apps for
 * `app.bsky.feed.post`) rather than "who owns this namespace", which
 * reverse-DNS gives us with no third party involved at all.
 */

/** A DNS label: at least one char, only a-z0-9-. */
const LABEL_RE = /^[a-z0-9-]+$/;

/**
 * First two dot-segments of an NSID, reversed and lowercased, e.g.
 * `app.bsky.feed.post` -> `bsky.app`. `null` for anything that isn't a
 * plausible NSID prefix -- fewer than 3 segments (a valid NSID always has at
 * least 3), empty/nullish input, or a segment that isn't a plausible DNS
 * label. Never throws: a record's collection string is data, not a
 * guaranteed-valid NSID, and may be anything.
 *
 * @param {string|null|undefined} nsid
 * @returns {string|null}
 */
export function appDomainOf(nsid) {
	if (typeof nsid !== 'string' || nsid.length === 0) return null;
	const segments = nsid.split('.');
	if (segments.length < 3) return null;
	const [a, b] = segments;
	const lowerA = a.toLowerCase();
	const lowerB = b.toLowerCase();
	if (!LABEL_RE.test(lowerA) || !LABEL_RE.test(lowerB)) return null;
	return `${lowerB}.${lowerA}`;
}

/**
 * Deep-link URL shapes for the handful of Bluesky lexicons whose public URL
 * convention is long-documented and stable. Deliberately tiny: a wrong deep
 * link is worse than a correct home page, and these could not be validated
 * by HTTP status (bsky.app is a client-rendered SPA that returns 200 for any
 * path) -- they rest on being documented conventions, not a probe. Do not
 * add entries here on a hunch; every other collection gets the domain root.
 *
 * @type {Record<string, (did: string, rkey: string|null|undefined) => string|null>}
 */
const BLUESKY_DEEP_LINKS = {
	'app.bsky.actor.profile': (did) => `https://bsky.app/profile/${encodeURIComponent(did)}`,
	'app.bsky.feed.post': (did, rkey) =>
		rkey == null
			? null
			: `https://bsky.app/profile/${encodeURIComponent(did)}/post/${encodeURIComponent(rkey)}`,
	'app.bsky.feed.generator': (did, rkey) =>
		rkey == null
			? null
			: `https://bsky.app/profile/${encodeURIComponent(did)}/feed/${encodeURIComponent(rkey)}`,
	'app.bsky.graph.list': (did, rkey) =>
		rkey == null
			? null
			: `https://bsky.app/profile/${encodeURIComponent(did)}/lists/${encodeURIComponent(rkey)}`
};

/**
 * The app link for a record: the owning domain plus the best URL to open.
 * `deep` is true only for the four documented Bluesky record shapes above;
 * everything else -- including a Bluesky collection outside that table, or
 * any deep link that can't be built for lack of a `rkey` -- falls back to
 * the domain root with `deep: false`.
 *
 * @param {string|null|undefined} nsid
 * @param {string|null|undefined} did
 * @param {string|null|undefined} rkey
 * @returns {{domain: string, url: string, deep: boolean}|null}
 */
export function appLinkFor(nsid, did, rkey) {
	const domain = appDomainOf(nsid);
	if (!domain) return null;
	const root = `https://${domain}/`;
	const deepLink = nsid != null && did != null ? BLUESKY_DEEP_LINKS[nsid]?.(did, rkey) : null;
	return deepLink ? { domain, url: deepLink, deep: true } : { domain, url: root, deep: false };
}
