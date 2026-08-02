import { describe, it, expect, vi } from 'vitest';
import { validateEdit, putRecord, deleteRecord } from './write.js';

describe('validateEdit', () => {
	const original = { $type: 'app.bsky.feed.post', text: 'hello' };

	it('accepts a well-formed edit that keeps $type', () => {
		const out = validateEdit(original, '{"$type":"app.bsky.feed.post","text":"changed"}');
		expect(out.ok).toBe(true);
		expect(out.value.text).toBe('changed');
	});

	it('rejects unparseable JSON with a reason', () => {
		const out = validateEdit(original, '{not json');
		expect(out.ok).toBe(false);
		expect(out.reason).toMatch(/JSON/i);
	});

	// changing $type makes the record a different kind of thing at the same
	// key, which is not a move this tool offers
	it('rejects a changed $type', () => {
		const out = validateEdit(original, '{"$type":"other.thing","text":"x"}');
		expect(out.ok).toBe(false);
		expect(out.reason).toMatch(/\$type/);
	});

	it('rejects introducing a $type where the original had none', () => {
		const out = validateEdit({ n: 1 }, '{"$type":"something.new","n":1}');
		expect(out.ok).toBe(false);
		expect(out.reason).toMatch(/\$type/);
	});

	// the direction most likely to happen by accident -- a user retyping or
	// pasting a fragment of the JSON body can drop the $type line without
	// noticing, and it must be caught just as hard as an explicit change
	it('rejects removing $type where the original had one', () => {
		const out = validateEdit(original, '{"text":"changed"}');
		expect(out.ok).toBe(false);
		expect(out.reason).toMatch(/\$type/);
	});

	it('accepts an edit when neither side has a $type', () => {
		expect(validateEdit({ n: 1 }, '{"n":2}').ok).toBe(true);
	});

	it('rejects a non-object top level', () => {
		expect(validateEdit(original, '[1,2,3]').ok).toBe(false);
		expect(validateEdit(original, '"a string"').ok).toBe(false);
		expect(validateEdit(original, 'null').ok).toBe(false);
		expect(validateEdit(original, '42').ok).toBe(false);
	});
});

/** A stand-in for OAuthSession, which exposes fetchHandler(pathname, init). */
function fakeSession(respond = async () => new Response('{}', { status: 200 })) {
	const calls = [];
	return {
		calls,
		fetchHandler: async (pathname, init) => {
			calls.push({ pathname, body: JSON.parse(init.body), method: init.method });
			return respond();
		}
	};
}

describe('putRecord', () => {
	it('posts to the putRecord xrpc endpoint with the right body', async () => {
		const session = fakeSession();
		await putRecord(session, {
			did: 'did:plc:abc',
			col: 'a.b.c',
			rkey: 'k1',
			value: { $type: 'a.b.c' }
		});
		expect(session.calls[0].pathname).toBe('/xrpc/com.atproto.repo.putRecord');
		expect(session.calls[0].method).toBe('POST');
		expect(session.calls[0].body).toEqual({
			repo: 'did:plc:abc',
			collection: 'a.b.c',
			rkey: 'k1',
			record: { $type: 'a.b.c' }
		});
	});

	it('propagates the server error verbatim rather than swallowing it', async () => {
		const session = fakeSession(
			async () =>
				new Response(JSON.stringify({ error: 'InvalidRecord', message: 'missing field' }), {
					status: 400
				})
		);
		await expect(
			putRecord(session, { did: 'd', col: 'c', rkey: 'k', value: {} })
		).rejects.toThrow(/InvalidRecord/);
	});
});

describe('deleteRecord', () => {
	it('posts to the deleteRecord xrpc endpoint with the right body', async () => {
		const session = fakeSession();
		await deleteRecord(session, { did: 'did:plc:abc', col: 'a.b.c', rkey: 'k1' });
		expect(session.calls[0].pathname).toBe('/xrpc/com.atproto.repo.deleteRecord');
		expect(session.calls[0].body).toEqual({
			repo: 'did:plc:abc',
			collection: 'a.b.c',
			rkey: 'k1'
		});
	});
});
