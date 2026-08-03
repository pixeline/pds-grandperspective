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
