import { describe, it, expect } from 'vitest';
import { audit } from './audit.js';

const NOW = Date.parse('2026-07-30T00:00:00Z');

describe('audit', () => {
	// the bug this encodes: Bluesky's schema was applied to lexicons that never
	// agreed to it, reporting 304 errors where 64 were real
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
	});

	it('reports a clean record as clean', () => {
		const clean = { $type: 'app.bsky.feed.post', text: 'hello', createdAt: '2026-01-01T00:00:00Z' };
		expect(audit('app.bsky.feed.post', '3lkwkzb3az22s', clean, null, NOW)).toEqual([]);
	});
});
