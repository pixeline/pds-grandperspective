import { describe, it, expect } from 'vitest';
import { buildTreemap } from './treemap.js';
import { collectionHues } from './hues.js';

function repo(spec) {
	const out = [];
	let t = Date.parse('2026-01-01T00:00:00Z');
	for (const [col, n] of Object.entries(spec)) {
		for (let i = 0; i < n; i++) {
			out.push({ col, ts: (t += 1000), rkey: `${col}-${i}`, bytes: 100, errs: 0, errNames: [] });
		}
	}
	return out;
}

describe('buildTreemap', () => {
	it('gives a collection area in proportion to its weight', () => {
		const records = repo({ 'a.b.big': 900, 'a.b.small': 100 });
		const { hueOf } = collectionHues(records);
		const { blocks } = buildTreemap(records, { w: 1000, h: 1000, weigh: 'records', hueOf });
		const big = blocks.find((b) => b.nsid === 'a.b.big');
		const small = blocks.find((b) => b.nsid === 'a.b.small');
		expect(big.w * big.h).toBeGreaterThan(small.w * small.h * 5);
	});

	it('flags blocks too small to resolve rather than faking one cell per record', () => {
		const records = repo({ 'a.b.c': 20000 });
		const { hueOf } = collectionHues(records);
		const { blocks, aggregated } = buildTreemap(records, { w: 60, h: 60, weigh: 'records', hueOf });
		expect(aggregated).toBeGreaterThan(0);
		expect(blocks.some((b) => b.aggregate)).toBe(true);
	});

	it('emits one cell per record when there is room', () => {
		const records = repo({ 'a.b.c': 4 });
		const { hueOf } = collectionHues(records);
		const { cells } = buildTreemap(records, { w: 400, h: 400, weigh: 'records', hueOf });
		expect(cells).toBe(4);
	});

	it('draws nothing for an empty repo instead of throwing', () => {
		const { hueOf } = collectionHues([]);
		const { blocks, cells } = buildTreemap([], { w: 400, h: 400, weigh: 'bytes', hueOf });
		expect(blocks).toEqual([]);
		expect(cells).toBe(0);
	});
});
