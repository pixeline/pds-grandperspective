import { describe, it, expect } from 'vitest';
import { collectionHues } from './hues.js';

const recs = (...cols) => cols.map((col) => ({ col }));

describe('collectionHues', () => {
	it('counts records per collection', () => {
		const { shares } = collectionHues(recs('a.b.c', 'a.b.c', 'x.y.z'));
		expect(shares.get('a.b.c')).toBe(2);
		expect(shares.get('x.y.z')).toBe(1);
	});

	// the property that matters: a collection keeps its colour no matter what
	// order the reader happened to return records in
	it('assigns the same hue regardless of read order', () => {
		const forward = collectionHues(recs('a.b.c', 'm.n.o', 'x.y.z')).hueOf;
		const reverse = collectionHues(recs('x.y.z', 'm.n.o', 'a.b.c')).hueOf;
		expect(forward.get('m.n.o')).toBe(reverse.get('m.n.o'));
		expect(forward.get('a.b.c')).toBe(reverse.get('a.b.c'));
	});

	it('spreads hues by the golden angle over sorted nsids', () => {
		const { hueOf } = collectionHues(recs('a.b.c', 'm.n.o', 'x.y.z'));
		expect(hueOf.get('a.b.c')).toBeCloseTo(0, 5);
		expect(hueOf.get('m.n.o')).toBeCloseTo(137.507, 3);
		expect(hueOf.get('x.y.z')).toBeCloseTo(275.014, 3);
	});

	it('returns empty maps for an empty repo', () => {
		const { hueOf, shares } = collectionHues([]);
		expect(hueOf.size).toBe(0);
		expect(shares.size).toBe(0);
	});
});
