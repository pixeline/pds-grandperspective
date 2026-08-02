import { describe, it, expect } from 'vitest';
import { buildIndex, hitTest } from './hittest.js';
import { buildTreemap } from './treemap.js';
import { collectionHues } from './hues.js';

/** Two blocks side by side, four cells each. */
const BLOCKS = [
	{
		nsid: 'a.b.left',
		x: 0, y: 0, w: 100, h: 100,
		aggregate: false,
		cells: [
			{ x: 0, y: 0, w: 50, h: 50, col: 'a.b.left', rkey: 'lt', ts: 1, bytes: 5, err: '' },
			{ x: 50, y: 0, w: 50, h: 50, col: 'a.b.left', rkey: 'rt', ts: 2, bytes: 6, err: '' },
			{ x: 0, y: 50, w: 50, h: 50, col: 'a.b.left', rkey: 'lb', ts: 3, bytes: 7, err: '' },
			{ x: 50, y: 50, w: 50, h: 50, col: 'a.b.left', rkey: 'rb', ts: 4, bytes: 8, err: '' }
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

	it('carries the fields the modal needs', () => {
		const hit = hitTest(index, 25, 25);
		expect(hit).toMatchObject({ col: 'a.b.left', rkey: 'lt', ts: 1, bytes: 5 });
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
});
