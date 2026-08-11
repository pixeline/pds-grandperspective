import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { alternativeAppsFor, appFilterOptions } from './waypoints.js';

const DID = 'did:plc:weedlv2mczjipzyjs324e6r5';

describe('offline boundary', () => {
	// The whole point of using only resolveAtUri/waypointActivity is that they
	// touch no network. If someone imports the handle/url resolvers, that
	// silently reintroduces a call to public.api.bsky.app -- a third party this
	// tool avoids. Assert the source never names them.
	it('never imports the network-touching waypoints functions', () => {
		const src = readFileSync(new URL('./waypoints.js', import.meta.url), 'utf8');
		// Strip comments first -- the header doc legitimately *names* these
		// functions to explain why they are avoided; only real code counts.
		const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
		expect(code).not.toMatch(/resolveHandle|resolveUrl|resolveViaApi/);
	});
});

describe('alternativeAppsFor', () => {
	it('returns nothing for an aggregate block', () => {
		const out = alternativeAppsFor({ col: 'app.bsky.feed.like', did: DID, aggregate: true });
		expect(out.all).toEqual([]);
	});

	it('returns nothing without a did or rkey', () => {
		expect(alternativeAppsFor({ col: 'app.bsky.feed.post', did: null, rkey: '3k' }).all).toEqual([]);
		expect(alternativeAppsFor({ col: 'app.bsky.feed.post', did: DID, rkey: null }).all).toEqual([]);
	});

	it('lists catalog clients for a post; nothing pinned without favorites', () => {
		const out = alternativeAppsFor({ col: 'app.bsky.feed.post', did: DID, rkey: '3k7abc' });
		expect(out.all.map((a) => a.id)).toContain('bluesky');
		// With no favorites passed, nothing is pinned -- "recommended" is not a
		// runtime concept here, only a default applied in preferences.js.
		expect(out.primary).toEqual([]);
	});

	it('pins favorites in the order given', () => {
		const out = alternativeAppsFor({
			col: 'app.bsky.feed.post',
			did: DID,
			rkey: '3k7abc',
			favorites: ['anisota', 'bluesky']
		});
		expect(out.primary.map((a) => a.id)).toEqual(['anisota', 'bluesky']);
		expect(out.primary.every((a) => a.favorite)).toBe(true);
	});

	it('builds correct deep-link URLs from the catalog', () => {
		const out = alternativeAppsFor({ col: 'app.bsky.feed.post', did: DID, rkey: '3k7abc' });
		const bsky = out.all.find((a) => a.id === 'bluesky');
		expect(bsky?.url).toBe(`https://bsky.app/profile/${DID}/post/3k7abc`);
	});

	it('hides apps with no matching records in the repo (activity: absent)', () => {
		// A repo of only tangled records: Grain (social.grain.*) has nothing here.
		const repoCollections = new Set(['sh.tangled.repo']);
		const out = alternativeAppsFor({
			col: 'sh.tangled.repo',
			did: DID,
			rkey: 'r1',
			repoCollections
		});
		expect(out.all.some((a) => a.id === 'grain')).toBe(false);
		// tangled itself is present and kept
		expect(out.all.some((a) => a.id === 'tangled')).toBe(true);
	});

	it('never lists a blocked domain (standard.site)', () => {
		const repoCollections = new Set(['site.standard.foo']);
		const out = alternativeAppsFor({
			col: 'site.standard.foo',
			did: DID,
			rkey: 'r1',
			repoCollections
		});
		expect(out.all.every((a) => a.domain !== 'standard.site')).toBe(true);
	});

	it('pins favorites to the top even when absent from the repo', () => {
		const repoCollections = new Set(['sh.tangled.repo']);
		const out = alternativeAppsFor({
			col: 'sh.tangled.repo',
			did: DID,
			rkey: 'r1',
			repoCollections,
			favorites: ['grain']
		});
		expect(out.primary[0]?.id).toBe('grain');
		expect(out.primary[0]?.favorite).toBe(true);
	});

	it('does not use the removed atmosphere-apps preference group', () => {
		// pinksky (Pinkleap) is folded into microblogging; a favorite of it still
		// pins even though the catalog files it under atmosphereApps.
		const out = alternativeAppsFor({
			col: 'app.bsky.feed.post',
			did: DID,
			rkey: '3k',
			favorites: ['pinksky']
		});
		expect(out.primary.map((a) => a.id)).toEqual(['pinksky']);
	});

	it('defaults to the app that owns the lexicon (Popfeed for a popfeed review)', () => {
		const repoCollections = new Set(['social.popfeed.review']);
		const out = alternativeAppsFor({
			col: 'social.popfeed.review',
			did: DID,
			rkey: 'r1',
			repoCollections,
			// a favorite that does NOT own this lexicon must not override the owner
			favorites: ['bluesky']
		});
		expect(out.defaultId).toBe('popfeed');
	});

	it('defaults to Tangled for a tangled record', () => {
		const repoCollections = new Set(['sh.tangled.repo']);
		const out = alternativeAppsFor({ col: 'sh.tangled.repo', did: DID, rkey: 'r1', repoCollections });
		expect(out.defaultId).toBe('tangled');
	});

	it('lets a matching favorite override the default (microblogging pick for a bsky post)', () => {
		const out = alternativeAppsFor({
			col: 'app.bsky.feed.post',
			did: DID,
			rkey: '3k',
			favorites: ['deer']
		});
		// Deer owns app.bsky.* and is the user's pick, so it wins over Bluesky.
		expect(out.defaultId).toBe('deer');
	});

	it('judges the default by the liked record for a like', () => {
		const value = { subject: { uri: `at://${DID}/app.bsky.feed.post/POST1`, cid: 'x' } };
		const out = alternativeAppsFor({
			col: 'app.bsky.feed.like',
			did: DID,
			rkey: 'LIKE1',
			value,
			favorites: ['deer']
		});
		// the like's subject is a bsky post, so the bsky favorite owns it
		expect(out.defaultId).toBe('deer');
	});

	it('follows a like/repost subject to the liked record', () => {
		const value = { subject: { uri: `at://${DID}/app.bsky.feed.post/POST1`, cid: 'x' } };
		const out = alternativeAppsFor({
			col: 'app.bsky.feed.like',
			did: DID,
			rkey: 'LIKE1',
			value
		});
		const bsky = out.all.find((a) => a.id === 'bluesky');
		// the link opens the liked POST, not the like record
		expect(bsky?.url).toContain('/post/POST1');
	});
});

describe('appFilterOptions', () => {
	it('collapses the many Bluesky clients into one "Bluesky" namespace entry', () => {
		const opts = appFilterOptions(['app.bsky.feed.post', 'app.bsky.feed.like']);
		const bsky = opts.filter((o) => o.prefix === 'app.bsky');
		expect(bsky).toHaveLength(1);
		expect(bsky[0].label).toBe('Bluesky');
	});

	it('names a single-owner namespace after its app (Tangled, Popfeed)', () => {
		const opts = appFilterOptions(['sh.tangled.repo', 'social.popfeed.review']);
		const byPrefix = Object.fromEntries(opts.map((o) => [o.prefix, o.label]));
		expect(byPrefix['sh.tangled']).toBe('Tangled');
		expect(byPrefix['social.popfeed']).toBe('Popfeed');
	});

	it('omits namespaces with no records in the repo', () => {
		const opts = appFilterOptions(['sh.tangled.repo']);
		expect(opts.some((o) => o.prefix === 'social.grain')).toBe(false);
		expect(opts.some((o) => o.prefix === 'sh.tangled')).toBe(true);
	});

	it('reports the matched collections for each namespace', () => {
		const opts = appFilterOptions(['sh.tangled.repo', 'sh.tangled.star', 'app.bsky.feed.post']);
		const tangled = opts.find((o) => o.prefix === 'sh.tangled');
		expect(tangled?.collections).toEqual(['sh.tangled.repo', 'sh.tangled.star']);
	});
});
