import { describe, it, expect } from 'vitest';
import { polarLayout, radiusFraction, raySaturation, RAYS, SAT_HALF_LIFE_DAYS } from './polar.js';
import { behaviorVector } from './behavior.js';

const DAY = 86400000;

describe('radiusFraction (fixed log)', () => {
	it('puts one record near centre and 10k at the edge', () => {
		expect(radiusFraction(0)).toBe(0);
		expect(radiusFraction(9999)).toBeCloseTo(1, 3);
	});
	it('clamps above 10k instead of overshooting', () => {
		expect(radiusFraction(1_000_000)).toBe(1);
	});
	it('is monotonic and compresses the tail', () => {
		expect(radiusFraction(100)).toBeGreaterThan(radiusFraction(10));
		expect(radiusFraction(10)).toBeCloseTo(0.25, 2);
	});
});

describe('raySaturation (recency)', () => {
	const now = Date.parse('2026-06-01T00:00:00Z');
	it('is zero for a ray that never happened', () => {
		expect(raySaturation(null, now)).toBe(0);
	});
	it('is full for something done just now', () => {
		expect(raySaturation(now, now)).toBeCloseTo(1, 3);
	});
	it('halves after one half-life', () => {
		expect(raySaturation(now - SAT_HALF_LIFE_DAYS * DAY, now)).toBeCloseTo(0.5, 3);
	});
});

describe('polarLayout', () => {
	const now = Date.parse('2026-06-01T00:00:00Z');
	const vector = behaviorVector([
		{ col: 'app.bsky.feed.like', ts: now, rkey: 'a', value: {} }
	]);
	const layout = polarLayout(vector, { size: 200, pad: 20, now });

	it('has seven axes in ray order with Create at the top (−90°)', () => {
		expect(layout.axes).toHaveLength(7);
		expect(layout.axes[0].key).toBe('create');
		expect(layout.axes[0].angle).toBeCloseTo(-Math.PI / 2, 6);
		expect(layout.axes[0].x).toBeCloseTo(100, 6); // cx, straight up
		expect(layout.axes[0].y).toBeCloseTo(20, 6);  // cy - radius
	});

	it('gives each ray a stable golden-angle hue', () => {
		expect(RAYS[0].hue).toBeCloseTo(0, 6);
		expect(RAYS[1].hue).toBeCloseTo(137.507, 3);
	});

	it('places the data point at the log radius of its count', () => {
		const react = layout.axes.find((a) => a.key === 'react');
		expect(react.count).toBe(1);
		expect(react.rFrac).toBeCloseTo(radiusFraction(1), 6);
		expect(react.sat).toBeCloseTo(1, 3); // liked just now → vivid
	});

	it('emits a polygon point per axis', () => {
		expect(layout.polygon).toHaveLength(7);
		expect(layout.polygon[3]).toEqual({
			x: layout.axes[3].px, y: layout.axes[3].py
		});
	});

	it('has four log rings labelled 10 / 100 / 1k / 10k', () => {
		expect(layout.rings.map((r) => r.label)).toEqual(['10', '100', '1k', '10k']);
		expect(layout.rings[3].r).toBeCloseTo(layout.radius, 6);
	});
});
