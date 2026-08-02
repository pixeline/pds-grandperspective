import { describe, it, expect } from 'vitest';
import { applyFilters } from './filter.js';

const T = (iso) => Date.parse(iso);

const RECORDS = [
	{ col: 'app.bsky.feed.post', rkey: 'aaa', ts: T('2025-01-01'), bytes: 10, value: { text: 'hello world' } },
	{ col: 'app.bsky.feed.like', rkey: 'bbb', ts: T('2025-06-01'), bytes: 20, value: { subject: { uri: 'at://x' } } },
	{ col: 'app.bskyfoo.thing', rkey: 'ccc', ts: T('2026-01-01'), bytes: 30, value: { note: 'unrelated' } },
	{ col: 'my.custom.rel', rkey: 'ddd', ts: T('2026-06-01'), bytes: 40, value: { nested: { deep: 'needle' } } }
];

const none = { collections: new Set(), from: null, to: null, query: '' };

describe('applyFilters', () => {
	it('passes everything through when nothing is set', () => {
		const out = applyFilters(RECORDS, none);
		expect(out.matched).toBe(4);
		expect(out.total).toBe(4);
		expect(out.bytes).toBe(100);
		expect(out.totalBytes).toBe(100);
	});

	it('matches an exact collection', () => {
		const out = applyFilters(RECORDS, { ...none, collections: new Set(['my.custom.rel']) });
		expect(out.records.map((r) => r.rkey)).toEqual(['ddd']);
	});

	// the trap: prefix matching must respect dot boundaries, or app.bsky
	// silently swallows app.bskyfoo
	it('matches a namespace prefix only on dot boundaries', () => {
		const out = applyFilters(RECORDS, { ...none, collections: new Set(['app.bsky']) });
		expect(out.records.map((r) => r.rkey).sort()).toEqual(['aaa', 'bbb']);
		expect(out.records.some((r) => r.col === 'app.bskyfoo.thing')).toBe(false);
	});

	it('treats an empty collection set as no filter, not as match-nothing', () => {
		expect(applyFilters(RECORDS, { ...none, collections: new Set() }).matched).toBe(4);
	});

	it('bounds by timeframe inclusively at both edges', () => {
		const out = applyFilters(RECORDS, { ...none, from: T('2025-06-01'), to: T('2026-01-01') });
		expect(out.records.map((r) => r.rkey)).toEqual(['bbb', 'ccc']);
	});

	it('accepts an open-ended range', () => {
		expect(applyFilters(RECORDS, { ...none, from: T('2026-01-01'), to: null }).matched).toBe(2);
		expect(applyFilters(RECORDS, { ...none, from: null, to: T('2025-01-01') }).matched).toBe(1);
	});

	it('searches inside nested record values', () => {
		const out = applyFilters(RECORDS, { ...none, query: 'needle' });
		expect(out.records.map((r) => r.rkey)).toEqual(['ddd']);
	});

	it('searches collection and rkey too, case-insensitively', () => {
		expect(applyFilters(RECORDS, { ...none, query: 'FEED.LIKE' }).matched).toBe(1);
		expect(applyFilters(RECORDS, { ...none, query: 'CCC' }).matched).toBe(1);
	});

	it('treats a whitespace-only query as no filter', () => {
		expect(applyFilters(RECORDS, { ...none, query: '   ' }).matched).toBe(4);
	});

	it('ANDs every filter together', () => {
		const out = applyFilters(RECORDS, {
			collections: new Set(['app.bsky']),
			from: T('2025-05-01'),
			to: null,
			query: 'at://'
		});
		expect(out.records.map((r) => r.rkey)).toEqual(['bbb']);
	});

	it('reports filtered and total byte weight separately', () => {
		const out = applyFilters(RECORDS, { ...none, collections: new Set(['my.custom.rel']) });
		expect(out.bytes).toBe(40);
		expect(out.totalBytes).toBe(100);
		expect(out.matched).toBe(1);
		expect(out.total).toBe(4);
	});

	it('survives a record with no value', () => {
		const out = applyFilters([{ col: 'a.b.c', rkey: 'x', ts: 0, bytes: 1 }], { ...none, query: 'zzz' });
		expect(out.matched).toBe(0);
	});

	// ~25 records in a real repo have no decodable TID and no createdAt --
	// singleton `self`-keyed config records, one per collection. They must not
	// coerce through null == 0 into "the dawn of time".
	describe('records with no timestamp', () => {
		const undated = [
			...RECORDS,
			{ col: 'blue.linkat.board', rkey: 'self', ts: null, bytes: 50, value: { cards: [] } }
		];

		it('keeps an undated record when no timeframe is set', () => {
			const out = applyFilters(undated, none);
			expect(out.matched).toBe(5);
			expect(out.bytes).toBe(150);
		});

		it('excludes an undated record whenever any bound is set', () => {
			// unknown time cannot be shown to fall inside a requested range, in
			// either direction -- so both bounds must exclude it, and the `to`-only
			// case is the one a null-coercing comparison gets wrong
			expect(applyFilters(undated, { ...none, from: T('2020-01-01') }).matched).toBe(4);
			expect(applyFilters(undated, { ...none, to: T('2030-01-01') }).matched).toBe(4);
		});

		it('still searches an undated record by content', () => {
			expect(applyFilters(undated, { ...none, query: 'linkat' }).matched).toBe(1);
		});
	});
});
