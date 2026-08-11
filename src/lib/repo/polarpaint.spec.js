import { describe, it, expect } from 'vitest';
import { paintPolar } from './polarpaint.js';
import { polarLayout } from './polar.js';
import { behaviorVector } from './behavior.js';

/** A 2D-context stub that records the calls the painter makes, including their arguments. */
function stubCtx() {
	let fillStyle = null, strokeStyle = null;
	const calls = { fillRect: [], fills: [], strokes: [], arc: 0, closePath: 0 };
	return {
		calls,
		beginPath() {}, moveTo() {}, lineTo() {},
		closePath() { calls.closePath++; },
		stroke() { calls.strokes.push(strokeStyle); },
		fill() { calls.fills.push(fillStyle); },
		arc() { calls.arc++; },
		fillRect(x, y) { calls.fillRect.push({ x, y, fillStyle }); },
		set fillStyle(v) { fillStyle = v; }, get fillStyle() { return fillStyle; },
		set strokeStyle(v) { strokeStyle = v; }, get strokeStyle() { return strokeStyle; },
		set lineWidth(_) {}
	};
}

describe('paintPolar', () => {
	const layout = polarLayout(behaviorVector([
		{ col: 'app.bsky.feed.like', ts: 1, rkey: 'a', value: {} }
	]), { size: 200 });
	const colors = { ink: '#111', inkSoft: '#888', fill: 'rgba(0,0,0,0.12)' };

	it('draws one hue square per ray and never a circle', () => {
		const ctx = stubCtx();
		paintPolar(ctx, layout, colors);
		expect(ctx.calls.fillRect.length).toBe(7); // seven data points, as squares
		expect(ctx.calls.arc).toBe(0);      // heptagon rings, no circles
	});

	it('closes every ring and the data polygon', () => {
		const ctx = stubCtx();
		paintPolar(ctx, layout, colors);
		expect(ctx.calls.closePath).toBe(5); // 4 rings + 1 polygon
		expect(ctx.calls.fills.length).toBeGreaterThanOrEqual(1); // polygon fill
	});

	it('draws squares at correct data coordinates', () => {
		const ctx = stubCtx();
		paintPolar(ctx, layout, colors);
		// Each square is drawn at (px - 2.5, py - 2.5) with size 5x5
		for (let i = 0; i < ctx.calls.fillRect.length; i++) {
			const rec = ctx.calls.fillRect[i];
			expect(rec.x).toBeCloseTo(layout.axes[i].px - 2.5, 1);
			expect(rec.y).toBeCloseTo(layout.axes[i].py - 2.5, 1);
		}
	});

	it('colours point squares with hsl (behaviour + recency), not neutral chrome', () => {
		const ctx = stubCtx();
		paintPolar(ctx, layout, colors);
		// Every square fillStyle should be an hsl( string (data colour), not neutral
		expect(ctx.calls.fillRect.every(r => String(r.fillStyle).startsWith('hsl('))).toBe(true);
	});

	it('fills polygon with neutral fill colour', () => {
		const ctx = stubCtx();
		paintPolar(ctx, layout, colors);
		// The polygon fill must use colors.fill, not any data colour
		expect(ctx.calls.fills.includes('rgba(0,0,0,0.12)')).toBe(true);
	});

	it('strokes polygon with ink', () => {
		const ctx = stubCtx();
		paintPolar(ctx, layout, colors);
		// The polygon stroke must use colors.ink
		expect(ctx.calls.strokes.includes('#111')).toBe(true);
	});
});
