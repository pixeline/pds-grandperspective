/**
 * Writes against the signed-in user's own repo.
 *
 * Only update and delete: the app never creates records, which is why `create`
 * is absent from the requested scope.
 */

/**
 * Check an edited record before it is written.
 *
 * `$type` must not change. Changing it would make the record a different kind
 * of thing at the same key -- a move this tool does not offer, and one that
 * could leave the owning app unable to read its own data. The rule holds in
 * both directions, including introducing a `$type` where there was none.
 *
 * @param {any} originalValue
 * @param {string} text
 * @returns {{ok: true, value: any} | {ok: false, reason: string}}
 */
export function validateEdit(originalValue, text) {
	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch (e) {
		return { ok: false, reason: `Not valid JSON: ${e?.message ?? e}` };
	}

	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
		return { ok: false, reason: 'A record must be a JSON object.' };
	}

	// Only the top-level $type is protected. At this key it is the record's
	// identity -- changing it (in either direction, including removing it)
	// makes the record a different kind of thing where something else
	// expected to find it. A $type nested further in, e.g. inside an embed,
	// is content: exactly what a raw-JSON editor exists to let someone
	// change. Locking a nested discriminator would block legitimate edits
	// and would need a per-lexicon schema this project deliberately does
	// not carry, so it is intentionally left unchecked here.
	const before = originalValue?.$type ?? null;
	const after = parsed.$type ?? null;
	if (before !== after) {
		return {
			ok: false,
			reason: `$type must stay ${before ?? '(absent)'}; this edit makes it ${after ?? '(absent)'}.`
		};
	}

	return { ok: true, value: parsed };
}

/** Bound on how long a write waits for a response before giving up on it. */
const WRITE_TIMEOUT_MS = 30_000;

/**
 * Post an XRPC procedure through the OAuth session.
 *
 * `OAuthSession` exposes `fetchHandler(pathname, init)` -- it has no `.call()`.
 * Going through it directly rather than wrapping it in `@atproto/api`'s Agent
 * keeps a third runtime dependency out of the project, and DPoP, token refresh
 * and nonce handling are all inside the handler already.
 *
 * A write that never settles -- a hung connection, a stuck DPoP nonce retry --
 * would otherwise leave the caller waiting forever with no way to back out.
 * `RecordModal` blocks its own close controls while a write is in flight
 * (deliberately: closing mid-write is what used to let a failure go
 * unseen), so an unbounded wait here would make the modal permanently
 * unclosable rather than just briefly so. The `AbortController` cancels the
 * underlying request when the timer fires; the `Promise.race` guarantees the
 * caller hears about it even if `fetchHandler` doesn't itself observe abort.
 *
 * @param {any} session
 * @param {string} nsid
 * @param {any} body
 */
async function procedure(session, nsid, body) {
	const controller = new AbortController();
	/** @type {any} */
	let timer;
	const timeout = new Promise((_, reject) => {
		timer = setTimeout(() => {
			controller.abort();
			// An aborted request may still have reached the server and been
			// applied -- this client only stopped waiting for the reply, it
			// did not learn the write failed. Say so plainly rather than
			// implying the write was rejected.
			reject(
				new Error(
					`Timed out waiting for a response after ${WRITE_TIMEOUT_MS / 1000}s. ` +
						`The write may or may not have gone through -- re-read the repository to check.`
				)
			);
		}, WRITE_TIMEOUT_MS);
	});

	let res;
	try {
		res = await Promise.race([
			session.fetchHandler(`/xrpc/${nsid}`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body),
				signal: controller.signal
			}),
			timeout
		]);
	} finally {
		clearTimeout(timer);
	}

	if (!res.ok) {
		// surface what the server said, not a generic failure
		const detail = await res.text().catch(() => '');
		let msg = detail;
		try {
			const j = JSON.parse(detail);
			msg = [j.error, j.message].filter(Boolean).join(': ') || detail;
		} catch {
			/* not JSON — the raw body is the best available detail */
		}
		throw new Error(`${res.status} ${msg}`.trim());
	}
}

/**
 * @param {any} session OAuth session
 * @param {{did: string, col: string, rkey: string, value: any}} p
 */
export async function putRecord(session, { did, col, rkey, value }) {
	// Deliberately NOT com.atproto.repo.putRecord. putRecord is an upsert, and
	// the PDS cannot tell from the auth phase alone whether a given call will
	// create or overwrite -- so it unconditionally asserts BOTH the `create`
	// and `update` repo actions before running (packages/pds/src/api/com/
	// atproto/repo/putRecord.ts). The granted scope here is `update`+`delete`
	// only, `create` deliberately excluded (see SCOPE in session.svelte.js),
	// so putRecord always 403s with a missing-scope error for this app, even
	// though it only ever edits records that already exist.
	//
	// applyWrites asserts per operation type instead: a request containing
	// only an `#update` write asserts only the `update` action (packages/pds/
	// src/api/com/atproto/repo/applyWrites.ts). That matches what this app
	// actually does and what the owner actually consented to, so it works
	// with the existing grant -- no re-authorization, no widened scope.
	//
	// Do not "simplify" this back to putRecord. It will pass against a mock
	// and fail 403 against a real PDS.
	await procedure(session, 'com.atproto.repo.applyWrites', {
		repo: did,
		writes: [
			{
				$type: 'com.atproto.repo.applyWrites#update',
				collection: col,
				rkey,
				value
			}
		]
	});
}

/**
 * @param {any} session OAuth session
 * @param {{did: string, col: string, rkey: string}} p
 */
export async function deleteRecord(session, { did, col, rkey }) {
	await procedure(session, 'com.atproto.repo.deleteRecord', {
		repo: did,
		collection: col,
		rkey
	});
}

/** The refusal reason `guardedWrite` returns for a key already in flight. */
export const ALREADY_IN_FLIGHT_REASON = 'A write for this record is already in progress.';

/**
 * Refuse to start a second write for a key that already has one running,
 * rather than letting two writes race against the same record with
 * whichever happens to resolve last silently winning.
 *
 * A display flag like a UI's own "busy" state is the wrong place to guard
 * this: it can legitimately be reset by something that has nothing to do
 * with whether a request is still in flight (e.g. the UI moving on to show
 * a different record and back). Concurrency control has to be keyed to the
 * record, tracked independently of whatever is currently on screen, and
 * this is deliberately a plain combinator with no state of its own --
 * `inFlight` is owned and reset by the caller (nothing here ever clears it
 * except the `finally` below, on the write it itself started).
 *
 * @param {Set<string|null>} inFlight
 * @param {string|null} key
 * @param {() => Promise<any>} run
 * @returns {Promise<{ok: true} | {ok: false, reason: string}>}
 */
export async function guardedWrite(inFlight, key, run) {
	if (inFlight.has(key)) {
		return { ok: false, reason: ALREADY_IN_FLIGHT_REASON };
	}
	inFlight.add(key);
	try {
		await run();
		return { ok: true };
	} finally {
		inFlight.delete(key);
	}
}
