import { describe, it, expect } from 'vitest';
import { TARGETS, targetFor, labelScaleFor, pngFilename } from './exportpng.js';

describe('targetFor', () => {
	it('uses the fixed avatar and banner sizes regardless of the viewport', () => {
		const vp = { w: 1440, h: 700, ratio: 2 };
		expect(targetFor('avatar', vp)).toMatchObject({ w: 1024, h: 1024, scale: 1 });
		expect(targetFor('banner', vp)).toMatchObject({ w: 3000, h: 1000, scale: 1 });
	});

	it('drops labels on the avatar and keeps them on the banner', () => {
		// 8.5px type inside a 1024px image is sub-pixel at avatar display size:
		// an unreadable mark carries no information
		expect(targetFor('avatar', { w: 900, h: 600 }).labels).toBe(false);
		expect(targetFor('banner', { w: 900, h: 600 }).labels).toBe(true);
	});

	it('lays "as shown" out at the real viewport, at the display density', () => {
		const t = targetFor('screen', { w: 1437.6, h: 703.2, ratio: 2 });
		// layout size is the CSS size, so the same cells resolve as on screen
		expect(t).toMatchObject({ w: 1438, h: 703, scale: 2, labelScale: 1 });
	});

	it('never lays out a zero-sized or sub-1x screen target', () => {
		const t = targetFor('screen', { w: 0, h: 0, ratio: 0 });
		expect(t.w).toBe(1);
		expect(t.h).toBe(1);
		expect(t.scale).toBe(1);
	});

	it('refuses an unknown target rather than silently exporting something else', () => {
		expect(() => targetFor('poster', { w: 900, h: 600 })).toThrow(/unknown export target/);
	});

	it('has a button label for every target', () => {
		for (const t of Object.values(TARGETS)) expect(t.button).toBeTruthy();
	});
});

describe('labelScaleFor', () => {
	it('scales type with the image, never below the on-screen size', () => {
		expect(labelScaleFor(900)).toBe(1);
		expect(labelScaleFor(400)).toBe(1);
		expect(labelScaleFor(3000)).toBeCloseTo(3000 / 900);
	});
});

describe('pngFilename', () => {
	it('names the repository, the target and the real pixel size', () => {
		expect(pngFilename('pixeline.be', 'avatar', 1024, 1024)).toBe(
			'pixeline.be-avatar-1024x1024.png'
		);
	});

	it('makes a DID filename-safe without losing it', () => {
		expect(pngFilename('did:plc:v4zpi74gy7enfiwke7hmoxv5', 'banner', 3000, 1000)).toBe(
			'did-plc-v4zpi74gy7enfiwke7hmoxv5-banner-3000x1000.png'
		);
	});

	it('falls back rather than producing a nameless file', () => {
		expect(pngFilename(null, 'screen', 900, 600)).toBe('repository-screen-900x600.png');
		expect(pngFilename('///', 'screen', 900, 600)).toBe('repository-screen-900x600.png');
	});
});
