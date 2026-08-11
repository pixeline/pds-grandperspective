/**
 * PROTOTYPE — waypoints-driven "Open as…" alternative apps.
 *
 * Wraps @aturi.to/waypoints' *offline* surface only (`resolveAtUri` +
 * `waypointActivity`). No network: we already read the repo by DID, so we never
 * touch the package's `resolveHandle`/`resolveUrl(fetchHead)`/`resolveViaApi`
 * paths, which would reach public.api.bsky.app and violate the client-side-only
 * constraint. A test guards that boundary (waypoints.spec.js).
 *
 * `resolveAtUri` alone returns ALL ~28 catalog clients for every record, each
 * best-effort URL'd to a profile root -- listing "Open as Grain" on a Tangled
 * repo. That is noise, and dishonest. This module trims it with
 * `waypointActivity`, which prefix-matches each client's declared
 * `expectedCollections` against the set of collections that actually exist in
 * THIS repo -- so a client with zero matching records is dropped. The user's
 * chosen favorites (see preferences.js) are always kept and pinned to the top,
 * even when absent from the repo.
 */

import {
	resolveAtUri,
	waypointActivity,
	WAYPOINT_DESTINATIONS_DATA,
	WAYPOINT_ORDER
} from '@aturi.to/waypoints';

/**
 * Hosts we refuse to drive traffic to. Mirrors appOf.js' BLOCKED_DOMAINS: the
 * standard.site landing page redirects lossily enough that "Open on
 * standard.site" is not what the user asked for.
 */
const BLOCKED_DOMAINS = new Set(['standard.site']);

/** @param {string} url @returns {string|null} */
function domainOf(url) {
	try {
		return new URL(url).hostname.replace(/^www\./, '');
	} catch {
		return null;
	}
}

/**
 * A like/repost points at another record via `subject.uri`. Opening the like
 * itself is useless; the user means the liked post. Pull that AT-URI out
 * defensively -- `value` is untrusted decoded data and may be anything.
 * @param {unknown} value
 * @returns {string|null}
 */
function subjectAtUri(value) {
	if (value == null || typeof value !== 'object') return null;
	const subject = /** @type {any} */ (value).subject;
	const uri = typeof subject === 'string' ? subject : subject?.uri;
	return typeof uri === 'string' && uri.startsWith('at://') ? uri : null;
}

/**
 * @typedef {Object} AltApp
 * @property {string} id
 * @property {string} name
 * @property {string} domain
 * @property {string} url
 * @property {string} category
 * @property {boolean} favorite
 * @property {'present'|'absent'|'unknown'} activity
 */

/**
 * How specifically an app claims `col`, as the length of its longest matching
 * `expectedCollections` prefix (0 = no claim). Longer = more specific owner:
 * Popfeed's `social.popfeed.` (14) beats a generic match, and lets us tell the
 * app that OWNS a lexicon from the many that merely also render it.
 * @param {string} col
 * @param {string} id
 * @returns {number}
 */
function ownershipLen(col, id) {
	const expected = WAYPOINT_DESTINATIONS_DATA[id]?.expectedCollections;
	if (!expected) return 0;
	let best = 0;
	for (const raw of expected) {
		const p = raw.replace(/\.$/, '');
		if (p && (col === p || col.startsWith(`${p}.`))) best = Math.max(best, p.length);
	}
	return best;
}

/**
 * Build the ordered, filtered "Open as…" list for a record.
 *
 * @param {Object} args
 * @param {string|null|undefined} args.col      record collection NSID
 * @param {string|null|undefined} args.did      repo DID
 * @param {string|null|undefined} args.rkey     record key (null for aggregates)
 * @param {boolean} [args.aggregate]            aggregate block -> no single record
 * @param {unknown} [args.value]                decoded record body (for subject-follow)
 * @param {ReadonlySet<string>|null} [args.repoCollections]  every collection in this repo
 * @param {ReadonlyArray<string>} [args.favorites]           waypoint ids to pin to top
 * @returns {{ primary: AltApp[], more: AltApp[], all: AltApp[], defaultId: string|null }}
 */
export function alternativeAppsFor({
	col,
	did,
	rkey,
	aggregate = false,
	value,
	repoCollections = null,
	favorites = []
}) {
	const empty = { primary: [], more: [], all: [], defaultId: null };
	// An aggregate has no single record behind it -- exactly the case where a
	// per-record "open on the app" link is a lie, so we show nothing (matches
	// the existing appLink behaviour).
	if (aggregate || !did || !col || rkey == null) return empty;

	// A like/repost is resolved from the record it points AT, so ownership and
	// the default app must be judged against that subject's collection, not the
	// like's own (`app.bsky.feed.like` would otherwise always look like Bluesky).
	const subjectUri = subjectAtUri(value);
	// `at://<did>/<collection>/<rkey>` -> parts = ['at:', '', did, collection, rkey]
	const subjectCol = subjectUri ? subjectUri.split('/')[3] : undefined;
	const effectiveCol = subjectCol || col;
	const atUri = subjectUri ?? `at://${did}/${col}/${rkey}`;
	const resolved = resolveAtUri(atUri);
	if (!resolved) return empty;

	const favSet = new Set(favorites);

	/** @type {AltApp[]} */
	const kept = [];
	for (const wp of resolved.waypoints) {
		const domain = domainOf(wp.url);
		if (!domain || BLOCKED_DOMAINS.has(domain)) continue;

		const meta = WAYPOINT_DESTINATIONS_DATA[wp.id];
		const activity = meta ? waypointActivity(meta, repoCollections) : 'unknown';
		const favorite = favSet.has(wp.id);

		// Drop clients that declare collections but have none in this repo,
		// unless the user favorited them. Keeps the list honest: no "Open as
		// Grain" when there isn't a single Grain record. A favorite is always
		// kept -- it's an explicit choice, not a guess.
		if (activity === 'absent' && !favorite) continue;

		kept.push({ id: wp.id, name: wp.name, domain, url: wp.url, category: wp.category, favorite, activity });
	}

	// `favorites` carries the user's chosen order (microblogging, publications,
	// atmosphere); pin them in that order. Everything else keeps the catalog's
	// stable resolve order.
	const favOrder = new Map(favorites.map((id, i) => [id, i]));
	const catOrder = new Map(resolved.waypoints.map((w, i) => [w.id, i]));

	const primary = kept
		.filter((a) => a.favorite)
		.sort((a, b) => (favOrder.get(a.id) ?? 0) - (favOrder.get(b.id) ?? 0));
	const more = kept
		.filter((a) => !a.favorite)
		.sort((a, b) => (catOrder.get(a.id) ?? 0) - (catOrder.get(b.id) ?? 0));
	const all = [...primary, ...more];

	// The default app the CTA opens directly. Preference beats convention:
	//   1. a favorite that OWNS this lexicon (the user's microblogging pick for
	//      an app.bsky.* record, their publications pick for a Leaflet doc, …),
	//   2. else the app that owns it most specifically (Popfeed for a
	//      social.popfeed.* review, Tangled for a sh.tangled.* repo),
	//   3. else just the first favorite, else the first app in the list.
	// Ties break toward the earlier item in `all` (favorites, then catalog order).
	const withLen = all.map((a) => ({ a, len: ownershipLen(effectiveCol, a.id) }));
	const owners = withLen.filter((o) => o.len > 0);
	const favOwner = owners.filter((o) => o.a.favorite).sort((x, y) => y.len - x.len)[0];
	const topOwner = owners.slice().sort((x, y) => y.len - x.len)[0];
	const defaultApp = favOwner?.a ?? topOwner?.a ?? primary[0] ?? all[0] ?? null;

	return { primary, more, all, defaultId: defaultApp?.id ?? null };
}

/**
 * Friendly labels for namespace prefixes that more than one catalog app
 * declares (so no single app name fits). Anything not here falls back to the
 * sole declaring app's name, or the prefix itself.
 */
const SHARED_PREFIX_LABEL = {
	'app.bsky': 'Bluesky',
	'pub.leaflet': 'Leaflet',
	'site.standard': 'Standard'
};

/**
 * Build the options for the "filter by app" control: one entry per lexicon
 * namespace that (a) at least one catalog app claims and (b) actually has
 * records in this repo. Selecting an entry restricts the treemap to that
 * namespace's collections. Keyed by the namespace prefix (trailing dot
 * stripped) so it maps straight onto the `only` filter and `underNamespace`.
 *
 * Namespaces are the right grain here, not apps: a dozen Bluesky clients all
 * render `app.bsky.*`, so they collapse into one "Bluesky" entry rather than
 * twelve identical filters. An app's own-brand namespace (e.g. `net.anisota.`,
 * declared by Anisota alone) becomes its own entry under that app's name.
 *
 * @param {Iterable<string>} collections  every collection NSID in the repo
 * @returns {Array<{prefix: string, label: string, collections: string[]}>}
 */
export function appFilterOptions(collections) {
	const cols = [...collections];
	/** @type {Map<string, {apps: Set<string>, cols: Set<string>}>} */
	const byPrefix = new Map();

	for (const id of WAYPOINT_ORDER) {
		const meta = WAYPOINT_DESTINATIONS_DATA[id];
		if (!meta?.expectedCollections) continue;
		for (const raw of meta.expectedCollections) {
			const prefix = raw.replace(/\.$/, '');
			if (!prefix) continue;
			const matched = cols.filter((c) => c === prefix || c.startsWith(`${prefix}.`));
			if (matched.length === 0) continue;
			let entry = byPrefix.get(prefix);
			if (!entry) {
				entry = { apps: new Set(), cols: new Set() };
				byPrefix.set(prefix, entry);
			}
			entry.apps.add(id);
			for (const c of matched) entry.cols.add(c);
		}
	}

	const out = [];
	for (const [prefix, { apps, cols: matched }] of byPrefix) {
		const label =
			apps.size === 1
				? WAYPOINT_DESTINATIONS_DATA[[...apps][0]].name
				: (SHARED_PREFIX_LABEL[prefix] ?? prefix);
		out.push({ prefix, label, collections: [...matched].sort() });
	}
	return out.sort((a, b) => a.label.localeCompare(b.label));
}
