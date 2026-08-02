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

/**
 * Post an XRPC procedure through the OAuth session.
 *
 * `OAuthSession` exposes `fetchHandler(pathname, init)` -- it has no `.call()`.
 * Going through it directly rather than wrapping it in `@atproto/api`'s Agent
 * keeps a third runtime dependency out of the project, and DPoP, token refresh
 * and nonce handling are all inside the handler already.
 *
 * @param {any} session
 * @param {string} nsid
 * @param {any} body
 */
async function procedure(session, nsid, body) {
	const res = await session.fetchHandler(`/xrpc/${nsid}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});

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
	await procedure(session, 'com.atproto.repo.putRecord', {
		repo: did,
		collection: col,
		rkey,
		record: value
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
