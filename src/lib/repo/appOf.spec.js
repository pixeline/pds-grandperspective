import { describe, it, expect } from 'vitest';
import { appDomainOf, appLinkFor } from './appOf.js';

describe('appDomainOf', () => {
	// real NSIDs from the measured 196-collection repository, not invented ones
	it('reverses the first two segments for a range of real lexicon owners', () => {
		expect(appDomainOf('app.bsky.feed.post')).toBe('bsky.app');
		expect(appDomainOf('blue.linkat.board')).toBe('linkat.blue');
		expect(appDomainOf('sh.tangled.repo')).toBe('tangled.sh');
		expect(appDomainOf('fyi.atstore.listing.favorite')).toBe('atstore.fyi');
		expect(appDomainOf('events.smokesignal.calendar.event')).toBe('smokesignal.events');
	});

	it('uses only the first two segments regardless of how much deeper the NSID goes', () => {
		expect(appDomainOf('chat.roomy.v0.thread')).toBe('roomy.chat');
	});

	it('returns null for anything with fewer than 3 segments, or empty/nullish input', () => {
		expect(appDomainOf('')).toBeNull();
		expect(appDomainOf(null)).toBeNull();
		expect(appDomainOf(undefined)).toBeNull();
		expect(appDomainOf('single')).toBeNull();
		expect(appDomainOf('two.segments')).toBeNull();
	});

	it('never throws on junk input, returning null for implausible DNS labels', () => {
		expect(() => appDomainOf('..')).not.toThrow();
		expect(appDomainOf('..')).toBeNull();
		expect(() => appDomainOf('a..b')).not.toThrow();
		expect(appDomainOf('a..b')).toBeNull();
		expect(() => appDomainOf('A B.C D.x')).not.toThrow();
		expect(appDomainOf('A B.C D.x')).toBeNull();
	});
});

describe('appLinkFor', () => {
	const did = 'did:plc:abc123';
	const rkey = '3l7xyz';

	it('produces the four documented Bluesky deep links, with did/rkey encoded', () => {
		expect(appLinkFor('app.bsky.actor.profile', did, rkey)).toEqual({
			domain: 'bsky.app',
			url: `https://bsky.app/profile/${encodeURIComponent(did)}`,
			deep: true
		});
		expect(appLinkFor('app.bsky.feed.post', did, rkey)).toEqual({
			domain: 'bsky.app',
			url: `https://bsky.app/profile/${encodeURIComponent(did)}/post/${encodeURIComponent(rkey)}`,
			deep: true
		});
		expect(appLinkFor('app.bsky.feed.generator', did, rkey)).toEqual({
			domain: 'bsky.app',
			url: `https://bsky.app/profile/${encodeURIComponent(did)}/feed/${encodeURIComponent(rkey)}`,
			deep: true
		});
		expect(appLinkFor('app.bsky.graph.list', did, rkey)).toEqual({
			domain: 'bsky.app',
			url: `https://bsky.app/profile/${encodeURIComponent(did)}/lists/${encodeURIComponent(rkey)}`,
			deep: true
		});
	});

	it('encodes did/rkey values that need it', () => {
		const weirdDid = 'did:web:example.com:alice bob';
		const weirdRkey = 'a/b c';
		const link = appLinkFor('app.bsky.feed.post', weirdDid, weirdRkey);
		expect(link.url).toBe(
			`https://bsky.app/profile/${encodeURIComponent(weirdDid)}/post/${encodeURIComponent(weirdRkey)}`
		);
	});

	it('falls back to the domain root with deep:false for a non-Bluesky collection', () => {
		expect(appLinkFor('sh.tangled.repo', did, rkey)).toEqual({
			domain: 'tangled.sh',
			url: 'https://tangled.sh/',
			deep: false
		});
	});

	it('falls back to the domain root with deep:false for a Bluesky collection outside the table', () => {
		expect(appLinkFor('app.bsky.feed.like', did, rkey)).toEqual({
			domain: 'bsky.app',
			url: 'https://bsky.app/',
			deep: false
		});
	});

	it('does not produce a URL ending in /undefined when rkey is null (aggregate case)', () => {
		const link = appLinkFor('app.bsky.feed.post', did, null);
		expect(link).toEqual({ domain: 'bsky.app', url: 'https://bsky.app/', deep: false });
		expect(link.url.endsWith('/undefined')).toBe(false);
	});

	it('returns null when the nsid does not resolve to a domain', () => {
		expect(appLinkFor('single', did, rkey)).toBeNull();
		expect(appLinkFor(null, did, rkey)).toBeNull();
	});
});

describe('appLinkFor with a subject (like/repost pointing at another record)', () => {
	const did = 'did:plc:abc123';
	const rkey = '3l7xyz';
	const subjectDid = 'did:plc:mhzudjib7boip3hqda3vaxyr';
	const subjectRkey = '3kneztyw2xd2o';
	const likeValue = {
		$type: 'app.bsky.feed.like',
		subject: {
			cid: 'bafyreicu3n3b',
			uri: `at://${subjectDid}/app.bsky.feed.post/${subjectRkey}`
		}
	};

	it("resolves a like's link from its subject post, using the subject's did/rkey rather than the like's own", () => {
		expect(appLinkFor('app.bsky.feed.like', did, rkey, likeValue)).toEqual({
			domain: 'bsky.app',
			url: `https://bsky.app/profile/${encodeURIComponent(subjectDid)}/post/${encodeURIComponent(subjectRkey)}`,
			deep: true,
			subject: true
		});
	});

	it('resolves a repost the same way', () => {
		const repostValue = {
			$type: 'app.bsky.feed.repost',
			subject: { cid: 'bafyreicu3n3b', uri: `at://${subjectDid}/app.bsky.feed.post/${subjectRkey}` }
		};
		expect(appLinkFor('app.bsky.feed.repost', did, rkey, repostValue)).toEqual({
			domain: 'bsky.app',
			url: `https://bsky.app/profile/${encodeURIComponent(subjectDid)}/post/${encodeURIComponent(subjectRkey)}`,
			deep: true,
			subject: true
		});
	});

	it("falls back to the subject's own domain root when the subject's collection has no known route", () => {
		const value = {
			subject: { cid: 'bafyreicu3n3b', uri: `at://${subjectDid}/sh.tangled.repo/abc123` }
		};
		expect(appLinkFor('app.bsky.feed.like', did, rkey, value)).toEqual({
			domain: 'tangled.sh',
			url: 'https://tangled.sh/',
			deep: false,
			subject: true
		});
	});

	it.each([
		['no subject property at all', {}],
		['a null subject', { subject: null }],
		['subject as a plain (non-uri) string', { subject: 'not a uri' }],
		['an at:// uri missing segments', { subject: { uri: 'at://did:plc:abc' } }],
		['a non-at:// url', { subject: { uri: 'https://example.com/post/1' } }]
	])('falls back to the record\'s own link, without throwing, for a malformed subject (%s)', (_label, value) => {
		expect(() => appLinkFor('app.bsky.feed.like', did, rkey, value)).not.toThrow();
		expect(appLinkFor('app.bsky.feed.like', did, rkey, value)).toEqual({
			domain: 'bsky.app',
			url: 'https://bsky.app/',
			deep: false
		});
	});

	it('is unchanged from current behaviour for a record with no subject at all (value omitted)', () => {
		expect(appLinkFor('app.bsky.feed.post', did, rkey)).toEqual({
			domain: 'bsky.app',
			url: `https://bsky.app/profile/${encodeURIComponent(did)}/post/${encodeURIComponent(rkey)}`,
			deep: true
		});
		expect(appLinkFor('app.bsky.feed.like', did, rkey)).toEqual({
			domain: 'bsky.app',
			url: 'https://bsky.app/',
			deep: false
		});
	});
});
