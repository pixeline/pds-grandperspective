import { describe, it, expect } from 'vitest';
import { tidToMs } from '../atproto/tid.js';
import { audit } from '../atproto/audit.js';
import { buildTreemap } from './treemap.js';
import { collectionHues } from '../repo/hues.js';

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
});

describe('audit', () => {
	// the bug: Bluesky's schema was applied to lexicons that never agreed to it,
	// tearing 240 plates where the auditor was wrong rather than the data
	it('does not require createdAt outside app.bsky', () => {
		const rec = { note: { createdAt: '2025-03-22T01:25:18.509Z' } };
		expect(audit('my.skylights.rel', '3lkwkzb3az22s', rec, null, NOW)).toEqual([]);
	});
	it('does not apply the 300-grapheme limit outside app.bsky.feed.post', () => {
		const long = { text: 'x'.repeat(5000), createdAt: '2026-01-01T00:00:00Z' };
		expect(audit('site.standard.document', 'abc', long, null, NOW)).toEqual([]);
		expect(audit('app.bsky.feed.post', 'abc', long, null, NOW)).toContain(
			'text over 300 graphemes'
		);
	});
	it('still flags genuinely universal breakage', () => {
		expect(audit('any.lexicon.thing', 'k', { $type: 'other.thing' }, null, NOW)).toContain(
			'$type ≠ collection'
		);
		expect(
			audit('any.lexicon.thing', 'k', { createdAt: 'not-a-date' }, null, NOW)
		).toContain('unparseable createdAt');
		const skew = { createdAt: new Date(NOW - 40 * 864e5).toISOString() };
		expect(audit('any.lexicon.thing', 'k', skew, NOW, NOW)).toContain('clock skew > 24h');
	});
});

function fixture() {
	const day = 864e5;
	const base = NOW - 30 * day;
	const records = [];
	for (let i = 0; i < 30; i++) {
		records.push({
			col: i % 3 === 0 ? 'app.bsky.feed.post' : 'my.custom.thing',
			ts: base + i * day + (i % 5) * 60e3,
			rkey: `k${i}`,
			errs: i === 7 ? 1 : 0,
			errNames: i === 7 ? ['clock skew > 24h'] : [],
			bytes: 100 + i
		});
	}
	return records;
}

describe('buildTreemap', () => {
	const records = fixture();
	const g = collectionHues(records);

	it('lays out every collection inside the canvas', () => {
		const { blocks } = buildTreemap(records, { w: 800, h: 600, weigh: 'records', hueOf: g.hueOf });
		expect(blocks.length).toBeGreaterThan(0);
		for (const b of blocks) {
			expect(b.x).toBeGreaterThanOrEqual(-0.01);
			expect(b.y).toBeGreaterThanOrEqual(-0.01);
			expect(b.x + b.w).toBeLessThanOrEqual(800.01);
			expect(b.y + b.h).toBeLessThanOrEqual(600.01);
		}
	});

	it('weighs by bytes when asked, so "disk usage" is literally true', () => {
		const byRec = buildTreemap(records, { w: 800, h: 600, weigh: 'records', hueOf: g.hueOf });
		const byByte = buildTreemap(records, { w: 800, h: 600, weigh: 'bytes', hueOf: g.hueOf });
		const area = (r) => r.blocks.reduce((s, b) => s + b.w * b.h, 0);
		expect(area(byByte)).toBeGreaterThan(0);
		expect(byByte.blocks.map((b) => b.bytes).reduce((s, n) => s + n, 0)).toBe(
			records.reduce((s, r) => s + r.bytes, 0)
		);
		expect(area(byRec)).toBeGreaterThan(0);
	});

	it('gives one cell per record when there is room', () => {
		const { cells } = buildTreemap(records, { w: 1200, h: 800, weigh: 'records', hueOf: g.hueOf });
		expect(cells).toBe(records.length);
	});
});
