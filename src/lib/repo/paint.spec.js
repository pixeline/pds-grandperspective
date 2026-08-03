import { describe, it, expect } from 'vitest';
import { paintMap } from './paint.js';
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

/**
 * A recording stub in place of a real 2D context. This is only possible
 * because paintMap takes a context and touches nothing else -- the same
 * property that lets the export reuse it.
 */
function stubCtx() {
	const ops = [];
	return {
		ops,
		set fillStyle(v) {
			ops.push(['fillStyle', v]);
		},
		set strokeStyle(v) {
			ops.push(['strokeStyle', v]);
		},
		set font(v) {
			ops.push(['font', v]);
		},
		set textBaseline(v) {
			ops.push(['textBaseline', v]);
		},
		clearRect: (...a) => ops.push(['clearRect', ...a]),
		fillRect: (...a) => ops.push(['fillRect', ...a]),
		fillText: (...a) => ops.push(['fillText', ...a]),
		measureText: (s) => ({ width: s.length * 5 })
	};
}

function mapOf(spec, w, h) {
	const records = repo(spec);
	const { hueOf } = collectionHues(records);
	return buildTreemap(records, { w, h, weigh: 'records', hueOf });
}

describe('paintMap', () => {
	it('fills one rect per record when cells resolve', () => {
		const map = mapOf({ 'a.b.c': 4 }, 400, 400);
		const ctx = stubCtx();
		paintMap(ctx, map, { w: 400, h: 400, labels: false });
		expect(map.cells).toBe(4);
		// the first fill is the background/clear, not a cell
		const fills = ctx.ops.filter(([op]) => op === 'fillRect');
		expect(fills).toHaveLength(4);
	});

	it('fills one rect per aggregated block, not per record', () => {
		const map = mapOf({ 'a.b.c': 20000 }, 60, 60);
		const ctx = stubCtx();
		paintMap(ctx, map, { w: 60, h: 60, labels: false });
		expect(map.aggregated).toBeGreaterThan(0);
		expect(ctx.ops.filter(([op]) => op === 'fillRect').length).toBeLessThan(20000);
	});

	it('clears when there is no background, and fills when there is', () => {
		const map = mapOf({ 'a.b.c': 4 }, 400, 400);

		const screen = stubCtx();
		paintMap(screen, map, { w: 400, h: 400, background: null, labels: false });
		expect(screen.ops[0]).toEqual(['clearRect', 0, 0, 400, 400]);

		const png = stubCtx();
		paintMap(png, map, { w: 400, h: 400, background: '#f7f7f7', labels: false });
		expect(png.ops[0]).toEqual(['fillStyle', '#f7f7f7']);
		expect(png.ops[1]).toEqual(['fillRect', 0, 0, 400, 400]);
	});

	it('never sets an undefined fill colour', () => {
		// passing undefined to fillStyle silently repaints the previous colour,
		// which would attribute one collection's bytes to another's hue
		const map = mapOf({ 'a.b.c': 30, 'a.b.d': 4000 }, 300, 200);
		const ctx = stubCtx();
		paintMap(ctx, map, { w: 300, h: 200, ink: '#171717' });
		for (const [op, v] of ctx.ops) {
			if (op === 'fillStyle' || op === 'strokeStyle') expect(v).toBeTruthy();
		}
	});

	it('draws no text at all when labels are off', () => {
		const map = mapOf({ 'a.b.c': 200 }, 900, 600);
		expect(map.blocks.some((b) => b.label)).toBe(true);

		const off = stubCtx();
		paintMap(off, map, { w: 900, h: 600, labels: false });
		expect(off.ops.some(([op]) => op === 'fillText')).toBe(false);

		const on = stubCtx();
		paintMap(on, map, { w: 900, h: 600, labels: true });
		expect(on.ops.some(([op]) => op === 'fillText')).toBe(true);
	});

	it('scales label type and its plate together', () => {
		const map = mapOf({ 'a.b.c': 200 }, 900, 600);

		const one = stubCtx();
		paintMap(one, map, { w: 900, h: 600, labelScale: 1 });
		const two = stubCtx();
		paintMap(two, map, { w: 900, h: 600, labelScale: 4 });

		expect(one.ops.find(([op]) => op === 'font')[1]).toContain('8.5px');
		expect(two.ops.find(([op]) => op === 'font')[1]).toContain('34px');

		// the plate is the rect drawn immediately before each fillText
		const plateHeight = (ctx) => {
			const i = ctx.ops.findIndex(([op]) => op === 'fillText');
			const rect = ctx.ops.slice(0, i).reverse().find(([op]) => op === 'fillRect');
			return rect[4];
		};
		expect(plateHeight(two)).toBe(plateHeight(one) * 4);
	});

	it('paints labels after every cell, so no record covers one', () => {
		const map = mapOf({ 'a.b.c': 200 }, 900, 600);
		const ctx = stubCtx();
		paintMap(ctx, map, { w: 900, h: 600 });
		const firstText = ctx.ops.findIndex(([op]) => op === 'fillText');
		// cell colours are the only hsl() fills; the last one must precede the
		// first label
		const lastCellColour = ctx.ops.reduce(
			(last, [op, v], i) => (op === 'fillStyle' && String(v).startsWith('hsl') ? i : last),
			-1
		);
		expect(firstText).toBeGreaterThan(0);
		expect(lastCellColour).toBeGreaterThan(-1);
		expect(lastCellColour).toBeLessThan(firstText);
	});
});

describe('paintMap labelInset', () => {
	// Vertical canvas (200 wide, 800 tall) with two equal-weight collections
	// produces blocks stacked top-to-bottom: block 1 at (x=6, y=6, w=188, h=388)
	// and block 2 at (x=6, y=406, w=188, h=388). With labelInset.top=50 the
	// top block's label is skipped, the bottom block's label survives. The
	// squarified layout always pads by 6px on the left/top, so no block is
	// ever drawn at exactly (0, 0) -- the test assertions are written in
	// terms of `b.y` >= `labelInset.top` rather than absolute 0.
	it('skips labels whose block starts above the inset (mobile: under the railtoggle)', () => {
		const map = mapOf({ 'a.b.c': 4, 'd.e.f': 4 }, 200, 800);
		const ctx = stubCtx();
		paintMap(ctx, map, {
			w: 200,
			h: 800,
			labels: true,
			labelInset: { top: 50, left: 0 }
		});

		const labelCalls = ctx.ops.filter(([op]) => op === 'fillText');
		const cellCalls = ctx.ops.filter(([op]) => op === 'fillRect');

		// cells were still drawn -- label inset doesn't shrink the map
		expect(cellCalls.length).toBeGreaterThan(0);
		// at least one label survived (the bottom block), not all of them
		expect(labelCalls.length).toBeGreaterThan(0);
		// and fewer than the number of fillStyle (cell) batches -- proving the
		// top block's label was skipped
		expect(labelCalls.length).toBeLessThan(ctx.ops.filter(([op]) => op === 'fillStyle').length);
	});

	it('every drawn label has b.y >= labelInset.top', () => {
		const map = mapOf({ 'a.b.c': 4, 'd.e.f': 4 }, 200, 800);
		const ctx = stubCtx();
		paintMap(ctx, map, {
			w: 200,
			h: 800,
			labels: true,
			labelInset: { top: 50, left: 0 }
		});

		// For each fillText, the immediately preceding fillRect is its plate
		// (the painter does plate-then-text in two consecutive ops). Walk
		// backwards to find it and assert plate.y >= 50.
		const ops = ctx.ops;
		let labelCount = 0;
		for (let i = 0; i < ops.length; i++) {
			if (ops[i][0] !== 'fillText') continue;
			labelCount++;
			const plateIdx = ops
				.slice(0, i)
				.reverse()
				.findIndex(([op]) => op === 'fillRect');
			const plate = ops.slice(0, i).reverse()[plateIdx];
			// fillRect args are (x, y, w, h) packed after the op name:
			// plate[1]=x, plate[2]=y, plate[3]=w, plate[4]=h. We want y.
			expect(plate[2]).toBeGreaterThanOrEqual(50);
		}
		// sanity: at least one label was drawn and the loop actually ran
		expect(labelCount).toBeGreaterThan(0);
	});

	it('defaults to labelInset {top: 0, left: 0} when omitted (every label drawn)', () => {
		const map = mapOf({ 'a.b.c': 4, 'd.e.f': 4 }, 200, 800);
		const ctx = stubCtx();
		paintMap(ctx, map, { w: 200, h: 800, labels: true });

		// both blocks have b.y >= 0, so both labels are drawn -- 2 fillTexts
		// total for this fixture.
		const labelCalls = ctx.ops.filter(([op]) => op === 'fillText');
		expect(labelCalls.length).toBe(2);
	});
});
