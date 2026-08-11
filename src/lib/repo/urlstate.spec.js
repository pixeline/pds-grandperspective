import { describe, it, expect } from 'vitest';
import { toHash, fromHash, defaultState } from './urlstate.js';

describe('urlstate', () => {
	it('omits everything that is at its default', () => {
		expect(toHash(defaultState())).toBe('#');
	});

	it('round-trips a fully populated state', () => {
		const state = {
			handle: 'pixeline.be',
			weigh: 'records',
			hidden: new Set(['app.bsky', 'my.custom.rel']),
			from: Date.parse('2025-01-01T00:00:00Z'),
			to: Date.parse('2026-01-01T00:00:00Z'),
			query: 'needle'
		};
		const back = fromHash(toHash(state));
		expect(back.handle).toBe('pixeline.be');
		expect(back.weigh).toBe('records');
		expect([...back.hidden].sort()).toEqual(['app.bsky', 'my.custom.rel']);
		expect(back.from).toBe(state.from);
		expect(back.to).toBe(state.to);
		expect(back.query).toBe('needle');
	});

	it('round-trips the hidden set through the hash key `hide`', () => {
		const h = toHash({ ...defaultState(), hidden: new Set(['app.bsky.feed.like']) });
		expect(h).toContain('hide=app.bsky.feed.like');
		expect([...fromHash(h).hidden]).toEqual(['app.bsky.feed.like']);
	});

	it('round-trips the app filter (`only`) through the hash key `only`', () => {
		const h = toHash({ ...defaultState(), only: new Set(['sh.tangled', 'social.popfeed']) });
		expect(h).toContain('only=sh.tangled%2Csocial.popfeed');
		expect([...fromHash(h).only].sort()).toEqual(['sh.tangled', 'social.popfeed']);
	});

	it('drops the retired stack keys instead of restoring them', () => {
		const back = fromHash('#h=a.test&gap=90&twist=16&cap=4000&v=stack&ax=-24');
		expect(back.handle).toBe('a.test');
		expect(back).not.toHaveProperty('gap');
		expect(back).not.toHaveProperty('cap');
		expect(back).not.toHaveProperty('v');
	});

	// `c` was the retired include-filter key. Reinterpreting it as the new
	// exclude-filter would silently show whoever opens an old shared link a
	// different repo view than the one that was shared -- it must be ignored,
	// not converted.
	it('ignores the retired `c` include-filter key rather than reinterpreting it', () => {
		const back = fromHash('#h=a.test&c=app.bsky.feed.like');
		expect(back.handle).toBe('a.test');
		expect(back.hidden).toEqual(new Set());
	});

	it('survives a malformed hash rather than throwing', () => {
		const back = fromHash('#from=notadate&weigh=purple&to=');
		expect(back.from).toBeNull();
		expect(back.weigh).toBe('bytes');
	});

	it('handles an empty hash', () => {
		expect(fromHash('')).toEqual(defaultState());
		expect(fromHash('#')).toEqual(defaultState());
	});

	it('encodes dates as ISO days, so the URL stays readable', () => {
		const h = toHash({ ...defaultState(), from: Date.parse('2025-03-04T00:00:00Z') });
		expect(h).toContain('from=2025-03-04');
	});
});
