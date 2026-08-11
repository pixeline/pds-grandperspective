/**
 * Behavioural profile of a repo: classify every emitted record into one of
 * seven participation modes, so the account's *kind* of activity (not just its
 * volume) becomes a shape. Anchored in Forrester's Social Technographics ladder
 * (Li & Bernoff, Groundswell 2008), renamed to atproto record types. Reading
 * and lurking leave no record, so they are unmeasurable and absent by design.
 *
 * Pure: a function of records already in memory after a read. No network.
 */

/** Canonical ray order — the source of truth for the count keys here and for
 *  the geometry (angles, hues) in polar.js. */
export const RAY_ORDER = [
	'create', 'converse', 'amplify', 'react', 'curate', 'connect', 'identity'
];

/** Exact NSID → ray for documented, stable Bluesky lexicons. `feed.post` is
 *  intentionally absent: it is split by value in classify(). */
const KNOWN = new Map([
	['app.bsky.feed.repost', 'amplify'],
	['app.bsky.feed.like', 'react'],
	['app.bsky.graph.list', 'curate'],
	['app.bsky.graph.listitem', 'curate'],
	['app.bsky.graph.starterpack', 'curate'],
	['app.bsky.feed.generator', 'curate'],
	['app.bsky.labeler.service', 'curate'],
	['app.bsky.feed.threadgate', 'curate'],
	['app.bsky.feed.postgate', 'curate'],
	['app.bsky.graph.follow', 'connect'],
	['app.bsky.graph.block', 'connect'],
	['app.bsky.actor.profile', 'identity'],
	['app.bsky.actor.status', 'identity'],
	['chat.bsky.actor.declaration', 'identity'],
	['com.whtwnd.blog.entry', 'create']
]);

/** Last NSID segment → ray, for apps with no explicit rule. Lets the wider
 *  atmosphere light the rays instead of collapsing to Bluesky. */
function heuristicRay(col) {
	const leaf = col.slice(col.lastIndexOf('.') + 1).toLowerCase();
	if (leaf === 'like') return 'react';
	if (leaf === 'repost' || leaf === 'share') return 'amplify';
	if (leaf === 'follow') return 'connect';
	if (leaf === 'post' || leaf === 'entry') return 'create';
	if (leaf === 'profile' || leaf === 'declaration') return 'identity';
	if (leaf === 'list' || leaf === 'generator') return 'curate';
	return null;
}

function isQuote(value) {
	const t = value?.embed?.$type;
	return t === 'app.bsky.embed.record' || t === 'app.bsky.embed.recordWithMedia';
}

/** One record → its ray, or null if nothing claims it. Priority for feed.post:
 *  quote → reply → plain, so a quote-reply counts once, as Amplify. */
function classify(r) {
	if (r.col === 'app.bsky.feed.post') {
		if (isQuote(r.value)) return 'amplify';
		if (r.value?.reply) return 'converse';
		return 'create';
	}
	return KNOWN.get(r.col) ?? heuristicRay(r.col);
}

/**
 * @param {Array<{col: string, ts: number|null, value?: any}>} records
 */
export function behaviorVector(records) {
	const counts = Object.fromEntries(RAY_ORDER.map((k) => [k, 0]));
	const lastActive = Object.fromEntries(RAY_ORDER.map((k) => [k, null]));
	let unclassified = 0;
	const unclassifiedCols = new Set();

	for (const r of records) {
		const ray = classify(r);
		if (ray == null) {
			unclassified++;
			unclassifiedCols.add(r.col);
			continue;
		}
		counts[ray]++;
		if (r.ts != null && (lastActive[ray] == null || r.ts > lastActive[ray])) {
			lastActive[ray] = r.ts;
		}
	}

	return {
		...counts,
		unclassified,
		unclassifiedCols: [...unclassifiedCols].sort(),
		lastActive
	};
}
