import { describe, it, expect } from 'vitest';
import { paintPolar } from './polarpaint.js';
import { polarLayout } from './polar.js';
import { behaviorVector } from './behavior.js';

/** A 2D-context stub that records the calls the painter makes. */
function stubCtx() {
	const calls = { fillRect: 0, arc: 0, closePath: 0, stroke: 0, fill: 0 };
	return {
		calls,
		beginPath() {}, moveTo() {}, lineTo() {},
		closePath() { calls.closePath++; },
		stroke() { calls.stroke++; },
		fill() { calls.fill++; },
		arc() { calls.arc++; },
		fillRect() { calls.fillRect++; },
		set strokeStyle(_) {}, set fillStyle(_) {}, set lineWidth(_) {}
	};
}

describe('paintPolar', () => {
	const layout = polarLayout(behaviorVector([
		{ col: 'app.bsky.feed.like', ts: 1, rkey: 'a', value: {} }
	]), { size: 200 });
	const colors = { ink: '#000', inkSoft: '#888', fill: 'rgba(0,0,0,0.1)' };

	it('draws one hue square per ray and never a circle', () => {
		const ctx = stubCtx();
		paintPolar(ctx, layout, colors);
		expect(ctx.calls.fillRect).toBe(7); // seven data points, as squares
		expect(ctx.calls.arc).toBe(0);      // heptagon rings, no circles
	});

	it('closes every ring and the data polygon', () => {
		const ctx = stubCtx();
		paintPolar(ctx, layout, colors);
		expect(ctx.calls.closePath).toBe(5); // 4 rings + 1 polygon
		expect(ctx.calls.fill).toBeGreaterThanOrEqual(1); // polygon fill
	});
});
