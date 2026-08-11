import { describe, it, expect } from 'vitest';
import { applyFilters } from './filter.js';

const T = (iso) => Date.parse(iso);

const RECORDS = [
	{ col: 'app.bsky.feed.post', rkey: 'aaa', ts: T('2025-01-01'), bytes: 10, value: { text: 'hello world' } },
	{ col: 'app.bsky.feed.like', rkey: 'bbb', ts: T('2025-06-01'), bytes: 20, value: { subject: { uri: 'at://x' } } },
	{ col: 'app.bskyfoo.thing', rkey: 'ccc', ts: T('2026-01-01'), bytes: 30, value: { note: 'unrelated' } },
	{ col: 'my.custom.rel', rkey: 'ddd', ts: T('2026-06-01'), bytes: 40, value: { nested: { deep: 'needle' } } }
];

const none = { hidden: new Set(), only: new Set(), from: null, to: null, query: '' };

describe('applyFilters', () => {
	it('passes everything through when nothing is set', () => {
		const out = applyFilters(RECORDS, none);
		expect(out.matched).toBe(4);
		expect(out.total).toBe(4);
		expect(out.bytes).toBe(100);
		expect(out.totalBytes).toBe(100);
	});

	it('hides an exact collection', () => {
		const out = applyFilters(RECORDS, { ...none, hidden: new Set(['my.custom.rel']) });
		expect(out.records.map((r) => r.rkey).sort()).toEqual(['aaa', 'bbb', 'ccc']);
	});

	// hiding one collection should remove exactly its records and leave the
	// rest untouched
	it('hiding one collection removes exactly its records and leaves the rest', () => {
		const out = applyFilters(RECORDS, { ...none, hidden: new Set(['app.bsky.feed.like']) });
		expect(out.records.map((r) => r.rkey).sort()).toEqual(['aaa', 'ccc', 'ddd']);
		expect(out.matched).toBe(3);
	});

	// the trap: prefix matching must respect dot boundaries, or app.bsky
	// silently swallows app.bskyfoo
	it('hides a namespace prefix only on dot boundaries', () => {
		const out = applyFilters(RECORDS, { ...none, hidden: new Set(['app.bsky']) });
		expect(out.records.map((r) => r.rkey).sort()).toEqual(['ccc', 'ddd']);
		expect(out.records.some((r) => r.col === 'app.bsky.feed.post')).toBe(false);
		expect(out.records.some((r) => r.col === 'app.bsky.feed.like')).toBe(false);
		// app.bskyfoo must survive -- it is NOT under the app.bsky namespace
		expect(out.records.some((r) => r.col === 'app.bskyfoo.thing')).toBe(true);
	});

	it('hiding a namespace prefix removes the whole branch', () => {
		const out = applyFilters(RECORDS, { ...none, hidden: new Set(['app.bsky']) });
		expect(out.matched).toBe(2);
		expect(out.records.map((r) => r.col)).not.toContain('app.bsky.feed.post');
		expect(out.records.map((r) => r.col)).not.toContain('app.bsky.feed.like');
	});

	it('treats an empty hidden set as no filter, not as hide-everything', () => {
		expect(applyFilters(RECORDS, { ...none, hidden: new Set() }).matched).toBe(4);
	});

	it('hiding every collection yields an empty result without throwing', () => {
		const all = new Set(RECORDS.map((r) => r.col));
		const out = applyFilters(RECORDS, { ...none, hidden: all });
		expect(out.records).toEqual([]);
		expect(out.matched).toBe(0);
		expect(out.total).toBe(4);
		expect(out.bytes).toBe(0);
		expect(out.totalBytes).toBe(100);
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
			hidden: new Set(['my.custom.rel']),
			from: T('2025-05-01'),
			to: null,
			query: 'at://'
		});
		expect(out.records.map((r) => r.rkey)).toEqual(['bbb']);
	});

	it('reports filtered and total byte weight separately', () => {
		const out = applyFilters(RECORDS, { ...none, hidden: new Set(['app.bsky']) });
		expect(out.bytes).toBe(70);
		expect(out.totalBytes).toBe(100);
		expect(out.matched).toBe(2);
		expect(out.total).toBe(4);
	});

	it('survives a record with no value', () => {
		const out = applyFilters([{ col: 'a.b.c', rkey: 'x', ts: 0, bytes: 1 }], { ...none, query: 'zzz' });
		expect(out.matched).toBe(0);
	});

	// The app filter: `only` is a show-list of namespace prefixes.
	it('restricts to records under an `only` prefix (dot-boundary respected)', () => {
		const out = applyFilters(RECORDS, { ...none, only: new Set(['app.bsky']) });
		// app.bsky.feed.post + app.bsky.feed.like, but NOT app.bskyfoo.thing
		expect(out.records.map((r) => r.rkey).sort()).toEqual(['aaa', 'bbb']);
	});

	it('unions multiple `only` prefixes', () => {
		const out = applyFilters(RECORDS, { ...none, only: new Set(['app.bsky.feed.post', 'my.custom.rel']) });
		expect(out.records.map((r) => r.rkey).sort()).toEqual(['aaa', 'ddd']);
	});

	it('composes `only` with `hidden` (only shows, hidden then removes)', () => {
		const out = applyFilters(RECORDS, {
			...none,
			only: new Set(['app.bsky']),
			hidden: new Set(['app.bsky.feed.like'])
		});
		expect(out.records.map((r) => r.rkey)).toEqual(['aaa']);
	});

	it('treats an empty `only` set as no restriction', () => {
		expect(applyFilters(RECORDS, { ...none, only: new Set() }).matched).toBe(4);
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

	describe('haystack caching', () => {
		it('returns identical results for the same query on a second call', () => {
			const first = applyFilters(RECORDS, { ...none, query: 'needle' });
			const second = applyFilters(RECORDS, { ...none, query: 'needle' });
			expect(second.records.map((r) => r.rkey)).toEqual(first.records.map((r) => r.rkey));
			expect(second.matched).toBe(first.matched);
		});

		// Documents the cache's semantics honestly rather than pretending it
		// revalidates: the haystack is memoised per record object on first
		// search, so a later mutation of `r.value` does not change what that
		// record matches. This is safe in this app because records are
		// replaced wholesale after a write (see read.js), never mutated in
		// place -- so a stale cache entry is never actually reachable -- but
		// the assumption is written down here rather than left implicit.
		it('keeps matching a mutated record against its ORIGINAL cached text', () => {
			const record = { col: 'a.b.c', rkey: 'x', ts: 0, bytes: 1, value: { note: 'original' } };
			const records = [record];

			const before = applyFilters(records, { ...none, query: 'original' });
			expect(before.matched).toBe(1);

			record.value = { note: 'changed' };

			// still matches the stale cached haystack, not the mutated value
			const stillOld = applyFilters(records, { ...none, query: 'original' });
			expect(stillOld.matched).toBe(1);

			// does not pick up the new content either -- the cache is not revalidated
			const notNew = applyFilters(records, { ...none, query: 'changed' });
			expect(notNew.matched).toBe(0);
		});
	});

	it('searches correctly for a record with no value across repeated calls', () => {
		const record = { col: 'a.b.c', rkey: 'x', ts: 0, bytes: 1 };
		expect(applyFilters([record], { ...none, query: 'a.b.c' }).matched).toBe(1);
		expect(applyFilters([record], { ...none, query: 'a.b.c' }).matched).toBe(1);
		expect(applyFilters([record], { ...none, query: 'zzz' }).matched).toBe(0);
	});
});
