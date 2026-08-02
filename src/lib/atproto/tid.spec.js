import { describe, it, expect } from 'vitest';
import { tidToMs, recordTime } from './tid.js';

const NOW = Date.parse('2026-07-30T00:00:00Z');

describe('tid', () => {
	it('decodes a real TID to a plausible time', () => {
		const ms = tidToMs('3lkwkzb3az22s', NOW);
		expect(ms).toBeGreaterThan(Date.parse('2025-01-01'));
		expect(ms).toBeLessThan(NOW);
	});

	it('rejects non-TID keys rather than inventing a time', () => {
		expect(tidToMs('self', NOW)).toBeNull();
		expect(tidToMs('!!!!!!!!!!!!!', NOW)).toBeNull();
		expect(tidToMs('', NOW)).toBeNull();
	});

	// the TID is server-assigned, createdAt is user-claimed, so TID wins
	it('prefers the TID over a claimed createdAt', () => {
		const r = recordTime('3lkwkzb3az22s', { createdAt: '2020-01-01T00:00:00Z' }, NOW);
		expect(r.source).toBe('tid');
		expect(r.ts).toBeGreaterThan(Date.parse('2025-01-01'));
	});

	it('falls back to createdAt when the rkey is not a TID', () => {
		const r = recordTime('self', { createdAt: '2020-01-01T00:00:00Z' }, NOW);
		expect(r.source).toBe('createdAt');
		expect(r.ts).toBe(Date.parse('2020-01-01T00:00:00Z'));
		expect(r.tid).toBeNull();
	});

	it('reports no timestamp rather than guessing one', () => {
		const r = recordTime('self', { nothing: true }, NOW);
		expect(r.ts).toBeNull();
		expect(r.source).toBeNull();
	});
});
