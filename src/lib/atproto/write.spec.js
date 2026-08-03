import { describe, it, expect, vi } from 'vitest';
import { validateEdit, putRecord, deleteRecord, guardedWrite } from './write.js';

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
	// putRecord (the app function) deliberately does NOT call the
	// com.atproto.repo.putRecord xrpc endpoint -- see the comment in write.js.
	// putRecord (the xrpc proc) is an upsert and unconditionally asserts both
	// the `create` and `update` repo actions, which would 403 against the
	// narrower update+delete-only scope this app actually requests. Routing
	// through applyWrites with a single #update operation asserts only
	// `update`, which the existing grant already covers.
	it('posts to applyWrites with a single #update operation, not the putRecord endpoint', async () => {
		const session = fakeSession();
		await putRecord(session, {
			did: 'did:plc:abc',
			col: 'a.b.c',
			rkey: 'k1',
			value: { $type: 'a.b.c' }
		});
		expect(session.calls[0].pathname).toBe('/xrpc/com.atproto.repo.applyWrites');
		expect(session.calls[0].method).toBe('POST');
		expect(session.calls[0].body).toEqual({
			repo: 'did:plc:abc',
			writes: [
				{
					$type: 'com.atproto.repo.applyWrites#update',
					collection: 'a.b.c',
					rkey: 'k1',
					value: { $type: 'a.b.c' }
				}
			]
		});
	});

	// The property that actually protects the narrow grant: no write this app
	// issues may ever contain a create operation, since the granted scope has
	// `create` deliberately absent. If this regresses, editing would start
	// 403ing again (or worse, silently start requesting a scope this app was
	// never meant to have).
	it('never includes a create operation in the write', async () => {
		const session = fakeSession();
		await putRecord(session, { did: 'did:plc:abc', col: 'a.b.c', rkey: 'k1', value: {} });
		const { writes } = session.calls[0].body;
		expect(writes.some((w) => w.$type.endsWith('#create'))).toBe(false);
		expect(writes.every((w) => w.$type === 'com.atproto.repo.applyWrites#update')).toBe(true);
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

describe('guardedWrite', () => {
	// This is the concurrency guard RecordModal.svelte relies on: a record's
	// own `busy` display flag can legitimately be reset by switching away
	// from it and back (see RecordModal's identity effect), so something
	// keyed to the record itself, independent of what is on screen, has to
	// be the thing that actually stops a second write from starting.
	it('refuses a second write for the same key while the first is in flight, but lets a different key through', async () => {
		vi.useFakeTimers();
		try {
			/** @type {Set<string>} */
			const inFlight = new Set();
			// A connection that never gets a response -- stands in for the
			// first write still being in flight when the second is attempted.
			const session = fakeSession(() => new Promise(() => {}));

			// Start a write for key A. Deliberately not awaited: it is never
			// going to resolve in this test, and only its synchronous side
			// effect (reaching fetchHandler, occupying the key) matters here.
			guardedWrite(inFlight, 'colA/rkeyA', () =>
				putRecord(session, { did: 'd', col: 'colA', rkey: 'rkeyA', value: {} })
			);
			expect(session.calls.length).toBe(1);
			expect(inFlight.has('colA/rkeyA')).toBe(true);

			// A second write for the SAME key must be refused before it ever
			// reaches fetchHandler, and must say why.
			const second = await guardedWrite(inFlight, 'colA/rkeyA', () =>
				putRecord(session, { did: 'd', col: 'colA', rkey: 'rkeyA', value: {} })
			);
			expect(second.ok).toBe(false);
			expect(second).toMatchObject({ reason: expect.stringMatching(/already in progress/i) });
			// still just the one call from the first write -- the refused
			// second call never touched the network
			expect(session.calls.length).toBe(1);

			// A write for a DIFFERENT key must go through undisturbed: the
			// guard is keyed to the record, not a global lock.
			guardedWrite(inFlight, 'colB/rkeyB', () =>
				putRecord(session, { did: 'd', col: 'colB', rkey: 'rkeyB', value: {} })
			);
			expect(session.calls.length).toBe(2);
		} finally {
			vi.useRealTimers();
		}
	});

	it('clears the key once the write settles, so a later write for the same key is allowed', async () => {
		const inFlight = new Set();
		const session = fakeSession();

		const outcome = await guardedWrite(inFlight, 'col/rkey', () =>
			putRecord(session, { did: 'd', col: 'col', rkey: 'rkey', value: {} })
		);

		expect(outcome.ok).toBe(true);
		expect(inFlight.has('col/rkey')).toBe(false);
		expect(session.calls.length).toBe(1);
	});

	it('clears the key on failure too, not just on success', async () => {
		const inFlight = new Set();
		const session = fakeSession(async () => new Response('boom', { status: 500 }));

		await expect(
			guardedWrite(inFlight, 'col/rkey', () =>
				putRecord(session, { did: 'd', col: 'col', rkey: 'rkey', value: {} })
			)
		).rejects.toThrow();

		expect(inFlight.has('col/rkey')).toBe(false);
	});
});

describe('write timeout', () => {
	// A hung connection or a stuck DPoP nonce retry must not leave the
	// caller waiting forever -- procedure() bounds the wait and reports a
	// timeout rather than hanging. Fake timers stand in for the real 30s so
	// this test does not actually wait 30 seconds.
	it('gives up after 30s rather than hanging forever, without claiming the write failed', async () => {
		vi.useFakeTimers();
		try {
			// fetchHandler that never resolves, standing in for a connection
			// that never gets a response.
			const session = fakeSession(() => new Promise(() => {}));

			const pending = putRecord(session, { did: 'd', col: 'c', rkey: 'k', value: {} });
			// Attach the rejection assertion before advancing the clock so
			// the rejection is observed rather than becoming unhandled.
			const assertion = expect(pending).rejects.toThrow(/timed out/i);
			await vi.advanceTimersByTimeAsync(30_000);
			await assertion;

			const err = await pending.catch((/** @type {any} */ e) => e);
			expect(err).toBeInstanceOf(Error);
			// The write may still have landed server-side -- this must never
			// read as "the write failed".
			expect(err.message).not.toMatch(/fail/i);
			expect(err.message).toMatch(/re-read/i);
		} finally {
			vi.useRealTimers();
		}
	});
});
