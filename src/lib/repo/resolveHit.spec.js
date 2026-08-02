import { describe, it, expect } from 'vitest';
import { resolveHit } from './resolveHit.js';

const RECORDS = [
	{ col: 'app.bsky.feed.post', rkey: 'abc', bytes: 42, exact: true, value: { $type: 'app.bsky.feed.post', text: 'hi' } },
	{ col: 'app.bsky.feed.post', rkey: 'def', bytes: 7, exact: false, value: { note: 'no $type here' } }
];

describe('resolveHit', () => {
	it('attaches the matching record\'s value -- the field RecordModal reads for the JSON pane, the edit textarea, the $type guard, and the createdAt/TID skew check', () => {
		const hit = { col: 'app.bsky.feed.post', rkey: 'abc', bytes: 42, aggregate: false };
		const resolved = resolveHit(hit, RECORDS);
		expect(resolved.value).toEqual({ $type: 'app.bsky.feed.post', text: 'hi' });
	});

	it('carries the matched record\'s own exact flag, not the hit\'s', () => {
		const hit = { col: 'app.bsky.feed.post', rkey: 'def', bytes: 7, aggregate: false };
		expect(resolveHit(hit, RECORDS).exact).toBe(false);
	});

	it('leaves the original hit fields intact', () => {
		const hit = { col: 'app.bsky.feed.post', rkey: 'abc', ts: 123, bytes: 42, err: '', aggregate: false };
		const resolved = resolveHit(hit, RECORDS);
		expect(resolved).toMatchObject({ col: 'app.bsky.feed.post', rkey: 'abc', ts: 123, bytes: 42, err: '' });
	});

	// an aggregate hit has no single record behind it -- looking one up would
	// either find nothing or, worse, coincidentally match an unrelated record
	// sharing a col/rkey pair with the aggregate's synthetic rkey
	it('passes an aggregate hit through unchanged', () => {
		const hit = { nsid: 'app.bsky.feed.post', col: 'app.bsky.feed.post', rkey: 'def', records: 900, bytes: 900, aggregate: true };
		expect(resolveHit(hit, RECORDS)).toBe(hit);
	});

	it('passes null through unchanged', () => {
		expect(resolveHit(null, RECORDS)).toBeNull();
	});

	it('returns the hit unchanged (no value attached) when no record matches', () => {
		const hit = { col: 'app.bsky.feed.post', rkey: 'ghost', bytes: 1, aggregate: false };
		const resolved = resolveHit(hit, RECORDS);
		expect(resolved.value).toBeUndefined();
		expect(resolved.rkey).toBe('ghost');
	});
});
