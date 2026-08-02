import { describe, it, expect } from 'vitest';
import { hasRepoWrite, SCOPE } from './session.svelte.js';

describe('SCOPE', () => {
	// repo:* is the full wildcard, which the permission spec allows; partial
	// wildcards like repo:app.bsky.* are prohibited. `create` is absent because
	// this app never creates records.
	it('requests update and delete on any collection, and nothing more', () => {
		expect(SCOPE).toBe('atproto repo:*?action=update&action=delete');
		expect(SCOPE).not.toContain('transition:generic');
		expect(SCOPE).not.toContain('action=create');
	});
});

describe('hasRepoWrite', () => {
	it('accepts the scope we asked for', () => {
		expect(hasRepoWrite('atproto repo:*?action=update&action=delete')).toBe(true);
	});

	it('accepts a server that granted the broader legacy scope', () => {
		expect(hasRepoWrite('atproto transition:generic')).toBe(true);
	});

	it('accepts an unparameterised wildcard, which means all actions', () => {
		expect(hasRepoWrite('atproto repo:*')).toBe(true);
	});

	// the failure this guards: an older auth server narrows the grant and the
	// app must go read-only rather than showing buttons that fail on click
	it('rejects a grant narrowed to identity only', () => {
		expect(hasRepoWrite('atproto')).toBe(false);
	});

	it('rejects a grant narrowed to a single collection', () => {
		expect(hasRepoWrite('atproto repo:app.bsky.feed.post?action=delete')).toBe(false);
	});

	// reading a field the SDK does not expose yields undefined; defaulting that
	// to "allowed" would show delete buttons backed by no grant at all
	it('rejects undefined, null and empty rather than defaulting to allowed', () => {
		expect(hasRepoWrite(undefined)).toBe(false);
		expect(hasRepoWrite(null)).toBe(false);
		expect(hasRepoWrite('')).toBe(false);
	});
});
