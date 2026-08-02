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

	// Regression for the span/age bug: newest/oldest must come from a scan of
	// records that actually carry a timestamp, not from the first/last array
	// slot. Adding an undated record -- at index 0, where the old code would
	// have read `records[0].ts` as the "oldest" and coerced null to 0 -- must
	// not perturb the ages of the dated records at all.
	it('derives span from timestamped records, unaffected by an undated record at any position', () => {
		const t0 = Date.parse('2026-01-01T00:00:00Z');
		const dated = [
			{ col: 'a.b.c', ts: t0, rkey: 'a.b.c-0', bytes: 100, errs: 0, errNames: [] },
			{ col: 'a.b.c', ts: t0 + 50000, rkey: 'a.b.c-1', bytes: 100, errs: 0, errNames: [] },
			{ col: 'a.b.c', ts: t0 + 100000, rkey: 'a.b.c-2', bytes: 100, errs: 0, errNames: [] }
		];
		const undated = { col: 'a.b.undated', ts: null, rkey: 'self', bytes: 40, errs: 0, errNames: [] };

		// a fixed hueOf shared by both runs isolates the comparison to the
		// span/age computation, rather than letting the extra collection shift
		// golden-angle hue assignment for 'a.b.c'
		const hueOf = new Map([
			['a.b.c', 0],
			['a.b.undated', 180]
		]);

		const cellsFor = (records) => {
			const { blocks } = buildTreemap(records, { w: 400, h: 400, weigh: 'records', hueOf });
			return blocks
				.find((b) => b.nsid === 'a.b.c')
				.cells.slice()
				.sort((a, b) => a.rkey.localeCompare(b.rkey));
		};

		const withoutUndated = cellsFor(dated);
		// undated placed first, the position the old buggy code read as "oldest"
		const withUndated = cellsFor([undated, ...dated]);

		expect(withUndated.map((c) => c.color)).toEqual(withoutUndated.map((c) => c.color));

		const { blocks } = buildTreemap([undated, ...dated], {
			w: 400,
			h: 400,
			weigh: 'records',
			hueOf
		});
		const undatedCell = blocks.find((b) => b.nsid === 'a.b.undated').cells[0];
		expect(undatedCell.undated).toBe(true);
		expect(undatedCell.ts).toBeNull();
		// off the recency ramp: not derived from (newest - ts) / span
		expect(undatedCell.color).toBe('hsl(180 12% 50%)');
	});
});
