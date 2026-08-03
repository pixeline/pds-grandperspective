import { describe, it, expect } from 'vitest';
import { selectDominantCollection, DOMINANCE_THRESHOLD } from './dominance.js';

const rec = (col, bytes) => ({ col, bytes });

describe('selectDominantCollection', () => {
	it('selects a collection that holds more than half the bytes', () => {
		const records = [rec('app.bsky.feed.like', 900), rec('app.bsky.feed.post', 100)];
		expect(selectDominantCollection(records)).toBe('app.bsky.feed.like');
	});

	it('selects nothing when no collection exceeds the threshold', () => {
		const records = [rec('a', 400), rec('b', 350), rec('c', 250)];
		expect(selectDominantCollection(records)).toBeNull();
	});

	// strictly greater-than: a tie sitting exactly on the threshold is not
	// dominance, in either direction
	it('selects nothing when two collections split exactly 50/50', () => {
		const records = [rec('a', 500), rec('b', 500)];
		expect(selectDominantCollection(records)).toBeNull();
	});

	// only one collection can ever exceed 50% of a whole -- this cannot
	// actually produce a multi-way tie above threshold, so the point of this
	// test is that the function stays total (a single collection or null)
	// and never throws, rather than that a tie-break rule was exercised
	it('is total: returns a single collection or null, never throws, across many collections none of which dominate', () => {
		const records = [rec('a', 300), rec('b', 300), rec('c', 300), rec('d', 100)];
		expect(() => selectDominantCollection(records)).not.toThrow();
		const result = selectDominantCollection(records);
		expect(result === null || typeof result === 'string').toBe(true);
		expect(result).toBeNull();
	});

	it('returns null for an empty record set', () => {
		expect(selectDominantCollection([])).toBeNull();
	});

	// the trap: the most NUMEROUS collection is not always the largest by
	// bytes -- selection must go by bytes, not record count
	it('selects by bytes, not by record count', () => {
		const records = [
			// 100 tiny records: numerous, but small in total
			...Array.from({ length: 100 }, () => rec('many.small.records', 1)),
			// one huge record: a single record, but the majority of bytes
			rec('one.big.record', 5000)
		];
		expect(selectDominantCollection(records)).toBe('one.big.record');
	});

	it('exposes the threshold as a single named constant set to 50%', () => {
		expect(DOMINANCE_THRESHOLD).toBe(0.5);
	});
});
