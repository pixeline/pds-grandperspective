/**
 * Behavioural profile of a repo: classify every emitted record into one of
 * seven participation modes, so the account's *kind* of activity (not just its
 * volume) becomes a shape. Anchored in Forrester's Social Technographics ladder
 * (Li & Bernoff, Groundswell 2008), renamed to atproto record types. Reading
 * and lurking leave no record, so they are unmeasurable and absent by design.
 *
 * Pure: a function of records already in memory after a read. No network.
 */

import { appDomainOf } from './appOf.js';

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
	// Verification records are vouches this account issued for others' identity
	// (the trusted-verifier mechanism). They are a role, not one of the seven
	// activity modes, so they are counted on their own rather than as a ray or
	// as unclassified noise.
	let verifications = 0;
	// Distinct atproto apps the account has any record in (reverse-DNS authority
	// of each collection). Breadth across apps is the "explorer" signal, separate
	// from how much the account does in any one of them.
	const appDomains = new Set();

	for (const r of records) {
		const app = appDomainOf(r.col);
		if (app) appDomains.add(app);

		if (r.col === 'app.bsky.graph.verification') {
			verifications++;
			continue;
		}
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
		lastActive,
		verifications,
		apps: appDomains.size
	};
}

const TYPE_LABEL = {
	create: 'Broadcaster',
	converse: 'Host',
	amplify: 'Amplifier',
	react: 'Listener',
	curate: 'Curator',
	connect: 'Connector',
	identity: 'Newcomer',
	generalist: 'Generalist'
};

/**
 * Share of records a typical account spends in each mode. Likes swamp almost
 * every repo, so ranking by raw count labels nearly everyone a Listener. These
 * baselines let the type name the mode an account does *more than usual*, which
 * is what actually distinguishes people. Rough by design (no live population is
 * available client-side); shifting them only nudges the boundaries.
 */
const TYPICAL = {
	react: 0.72,
	connect: 0.13,
	create: 0.055,
	amplify: 0.045,
	converse: 0.03,
	curate: 0.01,
	identity: 0.01
};

/** How far above its baseline a mode must reach to earn a named type. Below it,
 *  nothing stands out and the account is a Generalist. */
const STANDOUT = 1.25;

/**
 * The profile's headline type: the mode this account over-indexes on relative
 * to TYPICAL, not its raw plurality. A balanced account is a Generalist; an
 * empty repo has no type.
 * @param {ReturnType<behaviorVector>} vector
 * @returns {{ray: string|null, label: string}}
 */
export function dominantType(vector) {
	const total = RAY_ORDER.reduce((s, k) => s + vector[k], 0);
	if (total === 0) return { ray: null, label: '—' };

	let best = null;
	let bestIndex = 0;
	for (const key of RAY_ORDER) {
		const index = vector[key] / total / TYPICAL[key];
		if (index > bestIndex) {
			bestIndex = index;
			best = key;
		}
	}
	if (best == null || bestIndex < STANDOUT) return { ray: 'generalist', label: 'Generalist' };
	return { ray: best, label: TYPE_LABEL[best] };
}

/** One plain-language line per type, shown under the label so the word is not
 *  the only explanation of what the profile means. */
const TYPE_BLURB = {
	create: 'Posts more than the typical account.',
	converse: 'Lives in replies more than most.',
	amplify: 'Reposts and quotes more than most.',
	react: 'Likes far above average, and little else.',
	curate: 'Builds lists and feeds unusually often.',
	connect: 'Follows and blocks more than most.',
	identity: 'Barely active beyond a profile.',
	generalist: 'No single mode stands out.'
};

/**
 * The sentence under the dominant-type word. Empty for a repo with no type.
 * @param {string|null} ray
 * @returns {string}
 */
export function describeType(ray) {
	return ray == null ? '' : (TYPE_BLURB[ray] ?? '');
}
