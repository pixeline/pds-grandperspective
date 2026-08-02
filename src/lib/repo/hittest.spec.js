import { describe, it, expect } from 'vitest';
import { buildIndex, hitTest } from './hittest.js';
import { buildTreemap } from './treemap.js';
import { collectionHues } from './hues.js';

/**
 * Two blocks side by side, four cells each. Cells are squarified (variable
 * size -- see treemap.js), so the true tiling pitch is per-cell, not a
 * block-level scalar; each cell carries its own pitchW/pitchH.
 */
const BLOCKS = [
	{
		nsid: 'a.b.left',
		x: 0, y: 0, w: 100, h: 100,
		aggregate: false,
		cells: [
			{ x: 0, y: 0, w: 50, h: 50, pitchW: 50, pitchH: 50, col: 'a.b.left', rkey: 'lt', ts: 1, bytes: 5, err: '' },
			{ x: 50, y: 0, w: 50, h: 50, pitchW: 50, pitchH: 50, col: 'a.b.left', rkey: 'rt', ts: 2, bytes: 6, err: '' },
			{ x: 0, y: 50, w: 50, h: 50, pitchW: 50, pitchH: 50, col: 'a.b.left', rkey: 'lb', ts: 3, bytes: 7, err: '' },
			{ x: 50, y: 50, w: 50, h: 50, pitchW: 50, pitchH: 50, col: 'a.b.left', rkey: 'rb', ts: 4, bytes: 8, err: '' }
		]
	},
	{
		nsid: 'a.b.right',
		x: 100, y: 0, w: 100, h: 100,
		aggregate: true,
		rkey: 'agg',
		records: 900,
		bytes: 900,
		cells: []
	}
];

describe('hitTest', () => {
	const index = buildIndex(BLOCKS, 200, 100);

	it('resolves a point to the cell containing it', () => {
		expect(hitTest(index, 25, 25).rkey).toBe('lt');
		expect(hitTest(index, 75, 25).rkey).toBe('rt');
		expect(hitTest(index, 25, 75).rkey).toBe('lb');
		expect(hitTest(index, 75, 75).rkey).toBe('rb');
	});

	// cells are laid out edge to edge; an off-by-one here means the wrong
	// record opens in a modal that can delete it
	it('assigns a boundary point to exactly one cell', () => {
		const hit = hitTest(index, 50, 25);
		expect(hit).not.toBeNull();
		expect(['lt', 'rt']).toContain(hit.rkey);
	});

	it('reports an aggregated block as aggregate rather than inventing a record', () => {
		const hit = hitTest(index, 150, 50);
		expect(hit.aggregate).toBe(true);
		expect(hit.nsid).toBe('a.b.right');
		expect(hit.records).toBe(900);
	});

	it('returns null outside every block', () => {
		expect(hitTest(index, 500, 500)).toBeNull();
		expect(hitTest(index, -5, 10)).toBeNull();
	});

	// hittest.js stays deliberately display-shaped -- it never carries
	// `value`, only enough (col + rkey) for resolveHit.js to look the full
	// record up. This used to be named "carries the fields the modal needs"
	// and asserted a subset that omitted `value`, the one field
	// RecordModal exists to read -- a name that was not true. What this hit
	// shape actually promises is the identity pair plus display fields; the
	// modal's real contract (that `value` gets attached before the hit
	// reaches it) is resolveHit.spec.js's job to prove, not this one's.
	it('carries the col/rkey identity plus display fields, but never a record value', () => {
		const hit = hitTest(index, 25, 25);
		expect(hit).toMatchObject({ col: 'a.b.left', rkey: 'lt', ts: 1, bytes: 5 });
		expect(hit).not.toHaveProperty('value');
	});

	it('agrees with a real treemap layout at every cell centre', () => {
		const records = Array.from({ length: 24 }, (_, i) => ({
			col: i % 2 ? 'a.b.one' : 'a.b.two',
			ts: 1000 + i,
			rkey: `r${i}`,
			bytes: 100,
			errs: 0,
			errNames: []
		}));
		const { hueOf } = collectionHues(records);
		const { blocks } = buildTreemap(records, { w: 600, h: 400, weigh: 'records', hueOf });
		const idx = buildIndex(blocks, 600, 400);

		let checked = 0;
		for (const b of blocks) {
			for (const c of b.cells) {
				const hit = hitTest(idx, b.x + c.x + c.w / 2, b.y + c.y + c.h / 2);
				expect(hit?.rkey).toBe(c.rkey);
				checked++;
			}
		}
		expect(checked).toBeGreaterThan(0);
	});

	// treemap.js draws each cell inset (w-1 x h-1) for visual separation, but
	// that 1px gap sits on the true tiling pitch -- a real layout, not the
	// synthetic exactly-touching fixture above, is what proves the gap is
	// actually hit-tested rather than dead to the pointer.
	describe('against a real, single-collection layout (grid tiles the block exactly)', () => {
		const records = Array.from({ length: 16 }, (_, i) => ({
			col: 'a.b.only',
			ts: 1000 + i,
			rkey: `r${i}`,
			bytes: 100,
			errs: 0,
			errNames: []
		}));
		const { hueOf } = collectionHues(records);
		const { blocks } = buildTreemap(records, { w: 400, h: 400, weigh: 'records', hueOf });
		const block = blocks.find((b) => b.nsid === 'a.b.only');
		const idx = buildIndex(blocks, 400, 400);
		// equal-weight records ('records' mode) squarified into a square
		// block produce a regular grid, so the first cell's own pitch is
		// representative of the whole block's tiling
		const firstCell = block.cells[0];

		it('has no dead interior along a horizontal sweep (hit-tested at pitch, not drawn size)', () => {
			const y = block.y + firstCell.pitchH / 2;
			for (let x = block.x + 0.5; x < block.x + block.w; x += 0.5) {
				expect(hitTest(idx, x, y)).not.toBeNull();
			}
		});

		it('resolves a point that used to fall in the drawn-rect gap to the record whose pitch it sits in', () => {
			// just inside the pitch boundary of column 0, past where the old
			// (pitch - 1px) drawn cell used to end -- this used to be dead space
			const x = block.x + firstCell.pitchW - 0.5;
			const y = block.y + firstCell.pitchH / 2;
			const hit = hitTest(idx, x, y);
			expect(hit).not.toBeNull();
			expect(hit.rkey).toBe('r0');
		});
	});

	it('resolves a point exactly on the canvas far edge (x === w)', () => {
		const hit = hitTest(index, 200, 50);
		expect(hit).not.toBeNull();
		expect(hit.aggregate).toBe(true);
	});

	it('gives the same answers with a non-default bucket size', () => {
		const coarse = buildIndex(BLOCKS, 200, 100, 10);
		expect(hitTest(coarse, 25, 25).rkey).toBe('lt');
		expect(hitTest(coarse, 75, 75).rkey).toBe('rb');
		expect(hitTest(coarse, 150, 50).aggregate).toBe(true);
		expect(hitTest(coarse, 500, 500)).toBeNull();
	});
});
