import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getConnection } from './connection.js';

/**
 * The NetworkInformation API is a navigator-level thing with no first-class
 * vitest mock, so we swap `navigator.connection` in place around each test.
 * `navigator` exists in jsdom (vitest's default env) but does not carry a
 * `connection` member; we add and remove it explicitly.
 */
function setConn(value) {
	if (value === undefined) {
		// jsdom may make the property non-configurable in some versions; fall
		// back to `undefined` assignment when delete fails.
		try {
			delete navigator.connection;
		} catch {
			Object.defineProperty(navigator, 'connection', { configurable: true, value: undefined });
		}
	} else {
		Object.defineProperty(navigator, 'connection', { configurable: true, value });
	}
}

describe('getConnection', () => {
	const original = navigator.connection;

	beforeEach(() => {
		// start each test in the absent-API state
		try {
			delete navigator.connection;
		} catch {
			Object.defineProperty(navigator, 'connection', { configurable: true, value: undefined });
		}
	});

	afterEach(() => {
		setConn(original);
	});

	it('returns isSlow:false when navigator.connection is absent', () => {
		expect(getConnection()).toEqual({
			effectiveType: null,
			saveData: false,
			isSlow: false
		});
	});

	it('classifies slow-2g, 2g, and 3g as slow', () => {
		for (const effectiveType of ['slow-2g', '2g', '3g']) {
			setConn({ effectiveType, saveData: false });
			expect(getConnection().isSlow).toBe(true);
		}
	});

	it('classifies 4g as not slow', () => {
		setConn({ effectiveType: '4g', saveData: false });
		expect(getConnection().isSlow).toBe(false);
	});

	it('treats saveData:true as slow regardless of effectiveType', () => {
		setConn({ effectiveType: '4g', saveData: true });
		expect(getConnection()).toEqual({
			effectiveType: '4g',
			saveData: true,
			isSlow: true
		});
	});

	it('treats saveData:true as slow even when effectiveType is missing', () => {
		setConn({ saveData: true });
		expect(getConnection().isSlow).toBe(true);
	});

	it('never throws on a hostile navigator.connection', () => {
		setConn(null);
		expect(() => getConnection()).not.toThrow();
		expect(getConnection().isSlow).toBe(false);
	});
});
