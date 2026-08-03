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

	// Important 2: block-level area was already proportional to bytes, but
	// inside a block cells sat on a uniform grid -- a record's own size was
	// never consulted, so a 100,000 B record and a 100 B record in the same
	// collection drew identically. Cells are now themselves squarified by the
	// record's own weight, so this must hold one level down from the block.
	it('within one collection, gives a record ~1000x the bytes of another ~1000x the drawn area when weighing by bytes', () => {
		const records = [
			{ col: 'a.b.c', ts: 1, rkey: 'big', bytes: 100000, errs: 0, errNames: [] },
			{ col: 'a.b.c', ts: 2, rkey: 'small', bytes: 100, errs: 0, errNames: [] }
		];
		const { hueOf } = collectionHues(records);
		// A 1000:1 weight ratio between exactly two records forces the smaller
		// one into a full-height sliver just a fraction of a pixel wide in a
		// modest-sized block -- squarify's area-conservation is still exact
		// (area ratio 1000 regardless of container size), but the *shape*
		// legitimately fails the 2.5px pixel floor at typical canvas sizes.
		// A large container keeps the sliver's thin dimension above that
		// floor so the two-record case resolves rather than aggregating.
		const { blocks } = buildTreemap(records, { w: 20000, h: 20000, weigh: 'bytes', hueOf });
		const block = blocks.find((b) => b.nsid === 'a.b.c');
		const big = block.cells.find((c) => c.rkey === 'big');
		const small = block.cells.find((c) => c.rkey === 'small');
		// use the true tile (pitchW/pitchH), not the 1px-inset drawn size --
		// the inset is a fixed cosmetic amount that would distort the ratio
		// disproportionately for the smaller of the two cells
		const bigArea = big.pitchW * big.pitchH;
		const smallArea = small.pitchW * small.pitchH;
		expect(bigArea / smallArea).toBeGreaterThan(900);
		expect(bigArea / smallArea).toBeLessThan(1100);
	});

	// The weigh toggle has to mean something at cell level too: switching to
	// 'records' must erase the bytes-driven area difference above.
	it('gives cells in the same collection equal area when weighing by record count, regardless of byte size', () => {
		const records = [
			{ col: 'a.b.c', ts: 1, rkey: 'big', bytes: 100000, errs: 0, errNames: [] },
			{ col: 'a.b.c', ts: 2, rkey: 'small', bytes: 100, errs: 0, errNames: [] }
		];
		const { hueOf } = collectionHues(records);
		const { blocks } = buildTreemap(records, { w: 1000, h: 1000, weigh: 'records', hueOf });
		const block = blocks.find((b) => b.nsid === 'a.b.c');
		const big = block.cells.find((c) => c.rkey === 'big');
		const small = block.cells.find((c) => c.rkey === 'small');
		expect(big.pitchW * big.pitchH).toBeCloseTo(small.pitchW * small.pitchH, 0);
	});

	// Regression: aggregation must be decided from a *representative* cell
	// size (sqrt(blockArea / n)), not the single smallest rect squarify
	// produced. At real-world scale (a few thousand records) there is almost
	// always one record far smaller than the rest, and testing the minimum
	// meant that one outlier condemned the whole block -- which is exactly
	// what made app.bsky.feed.post (4,119 records) collapse to one flat
	// block. A block this size, with one record 1000x smaller than the
	// median, must still resolve to per-record cells.
	it('resolves per-record cells even when one record among many is 1000x smaller than the median', () => {
		const records = [
			{ col: 'a.b.c', ts: 1, rkey: 'tiny', bytes: 1, errs: 0, errNames: [] },
			...Array.from({ length: 499 }, (_, i) => ({
				col: 'a.b.c', ts: i + 2, rkey: `mid-${i}`, bytes: 1000, errs: 0, errNames: []
			}))
		];
		const { hueOf } = collectionHues(records);
		const { blocks } = buildTreemap(records, { w: 400, h: 400, weigh: 'bytes', hueOf });
		const block = blocks.find((b) => b.nsid === 'a.b.c');
		expect(block.aggregate).toBe(false);
		expect(block.cells.length).toBe(500);
	});

	// The threshold must not simply be disabled by the fix above: a block
	// whose records are *uniformly* too small to resolve (every cell, not
	// just an outlier, falls under the pixel floor) must still aggregate.
	it('still aggregates a block whose records are uniformly too small to resolve', () => {
		const records = Array.from({ length: 500 }, (_, i) => ({
			col: 'a.b.c', ts: i + 1, rkey: `r-${i}`, bytes: 100, errs: 0, errNames: []
		}));
		const { hueOf } = collectionHues(records);
		const { blocks, aggregated } = buildTreemap(records, {
			w: 30,
			h: 30,
			weigh: 'bytes',
			hueOf
		});
		const block = blocks.find((b) => b.nsid === 'a.b.c');
		expect(block.aggregate).toBe(true);
		expect(block.cells.length).toBe(0);
		expect(aggregated).toBeGreaterThan(0);
	});
});
