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
 * Hosts this tool refuses to drive traffic to. The first entry,
 * `standard.site`, is a placeholder page whose redirect is lossy enough
 * that "Open on standard.site" is not what the user asked for. Add
 * future entries here with the same justification. Empty entries
 * (someone trying to remove a block) MUST be cleared by deletion, not
 * by leaving an empty string -- `Set.has('')` matches every host.
 */
export const BLOCKED_DOMAINS = new Set(['standard.site']);

/**
 * Encode a path segment for a bsky.app URL, but restore literal colons
 * afterward.
 *
 * A colon is a legal `pchar` under RFC 3986 -- it does not need escaping in a
 * path segment -- and every atproto tool renders DIDs with plain colons
 * (`did:plc:...`, `did:web:...`). `encodeURIComponent` escapes it anyway
 * (`%3A`), which bsky.app tolerates but nothing else is guaranteed to, and it
 * is simply ugly.
 *
 * This does NOT skip encoding altogether: a `did:web` may legitimately carry
 * a percent-encoded port (`did:web:example.com%3A3000`), and an rkey is
 * attacker-influenced data that must stay escaped for any character that
 * actually needs it. Encoding first and then unescaping only the colon is the
 * narrow fix -- everything else `encodeURIComponent` would escape stays
 * escaped.
 *
 * @param {string} segment
 * @returns {string}
 */
function encodePathSegment(segment) {
	return encodeURIComponent(segment).replace(/%3A/g, ':');
}

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
	'app.bsky.actor.profile': (did) => `https://bsky.app/profile/${encodePathSegment(did)}`,
	'app.bsky.feed.post': (did, rkey) =>
		rkey == null
			? null
			: `https://bsky.app/profile/${encodePathSegment(did)}/post/${encodePathSegment(rkey)}`,
	'app.bsky.feed.generator': (did, rkey) =>
		rkey == null
			? null
			: `https://bsky.app/profile/${encodePathSegment(did)}/feed/${encodePathSegment(rkey)}`,
	'app.bsky.graph.list': (did, rkey) =>
		rkey == null
			? null
			: `https://bsky.app/profile/${encodePathSegment(did)}/lists/${encodePathSegment(rkey)}`
};

/**
 * Parse an `at://did/collection/rkey` URI into its three parts. Never
 * throws: a record's `value` is untrusted data, so this must be safe against
 * anything -- not a string, no `at://` prefix, missing segments, empty
 * segments. Returns `null` for anything that isn't a clean three-segment
 * reference.
 *
 * @param {unknown} uri
 * @returns {{did: string, collection: string, rkey: string}|null}
 */
function parseAtUri(uri) {
	if (typeof uri !== 'string' || !uri.startsWith('at://')) return null;
	const rest = uri.slice('at://'.length);
	if (!rest) return null;
	const [refDid, collection, rkey] = rest.split('/');
	if (!refDid || !collection || !rkey) return null;
	return { did: refDid, collection, rkey };
}

/**
 * Pull a `subject` URI out of a record's decoded value, if there is one to
 * find. Handles the documented shape (`subject: {uri, cid}`, as on
 * `app.bsky.feed.like`/`.repost`) as well as a bare-string `subject`, since
 * some lexicons may use that shape instead -- either way the result is only
 * ever a candidate string, validated by `parseAtUri` before it's trusted.
 * `value` is untrusted third-party data: it may not even be an object.
 *
 * @param {unknown} value
 * @returns {unknown} whatever was found at `subject`/`subject.uri`, unvalidated
 */
function subjectUriOf(value) {
	if (value == null || typeof value !== 'object') return null;
	const subject = /** @type {any} */ (value).subject;
	if (typeof subject === 'string') return subject;
	if (subject != null && typeof subject === 'object') return subject.uri;
	return null;
}

/**
 * The app link for a record: the owning domain plus the best URL to open.
 *
 * When the record's value carries a `subject.uri` pointing at another
 * record (as `app.bsky.feed.like` and `.repost` do -- and any third-party
 * lexicon shaped the same way, since this is driven by shape, not a
 * collection allowlist), the link is resolved from THAT subject instead of
 * from this record's own collection/did/rkey: a like should open the liked
 * post, not bsky.app's home feed. `subject: true` marks a link resolved this
 * way, so callers can word a button around "this opens something else"
 * rather than implying the record links to itself.
 *
 * The subject is parsed defensively (see `parseAtUri`/`subjectUriOf`) --
 * missing, null, a plain string, a malformed or non-`at://` URI all fall
 * through to this record's own link, exactly as if there were no subject at
 * all. A subject that parses fine but whose collection has no known route
 * still prefers the SUBJECT's domain root over this record's, since the
 * subject is what the button is about.
 *
 * Independent of that: `deep` is true only for the four documented Bluesky
 * record shapes in `BLUESKY_DEEP_LINKS`; everything else -- including a
 * Bluesky collection outside that table, or any deep link that can't be
 * built for lack of a `rkey` -- falls back to the domain root with
 * `deep: false`.
 *
 * @param {string|null|undefined} nsid
 * @param {string|null|undefined} did
 * @param {string|null|undefined} rkey
 * @param {unknown} [value] the record's decoded body, checked for `subject.uri`
 * @returns {{domain: string, url: string, deep: boolean, subject?: true}|null}
 */
export function appLinkFor(nsid, did, rkey, value) {
	const subjectRef = parseAtUri(subjectUriOf(value));
	if (subjectRef) {
		const subjectDomain = appDomainOf(subjectRef.collection);
		if (subjectDomain && !BLOCKED_DOMAINS.has(subjectDomain)) {
			const deepLink = BLUESKY_DEEP_LINKS[subjectRef.collection]?.(
				subjectRef.did,
				subjectRef.rkey
			);
			return deepLink
				? { domain: subjectDomain, url: deepLink, deep: true, subject: true }
				: { domain: subjectDomain, url: `https://${subjectDomain}/`, deep: false, subject: true };
		}
		// subject resolved to a domain we don't link to, or has no domain --
		// fall through to this record's own link below.
	}

	const domain = appDomainOf(nsid);
	if (!domain) return null;
	if (BLOCKED_DOMAINS.has(domain)) return null;
	const root = `https://${domain}/`;
	const deepLink = nsid != null && did != null ? BLUESKY_DEEP_LINKS[nsid]?.(did, rkey) : null;
	return deepLink ? { domain, url: deepLink, deep: true } : { domain, url: root, deep: false };
}
