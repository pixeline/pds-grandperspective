/**
 * Identity resolution: handle → DID → PDS endpoint.
 * Public XRPC reads need no auth, so all of this runs in the browser.
 */

/**
 * @param {string} url
 * @param {AbortSignal} [signal]
 */
export async function jget(url, signal) {
	const r = await fetch(url, { signal });
	if (!r.ok) throw new Error(`${r.status} from ${new URL(url).host}`);
	return r.json();
}

/** @param {string} did */
async function fetchDidDoc(did, signal) {
	if (did.startsWith('did:plc:')) return jget(`https://plc.directory/${did}`, signal);
	if (did.startsWith('did:web:')) {
		// did:web:example.com:path → https://example.com/path/.well-known/did.json
		const host = did.slice(8).replace(/:/g, '/');
		return jget(`https://${host}/.well-known/did.json`, signal);
	}
	throw new Error(`Unsupported DID method: ${did.split(':')[1]}`);
}

/**
 * @param {string} input handle, @handle or did
 * @param {AbortSignal} [signal]
 * @returns {Promise<{did:string,pds:string}>}
 */
export async function resolveIdentity(input, signal) {
	let did = input.trim().replace(/^@/, '');
	if (!did.startsWith('did:')) {
		const j = await jget(
			`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(did)}`,
			signal
		);
		did = j.did;
	}
	const doc = await fetchDidDoc(did, signal);
	const svc = (doc.service || []).find((/** @type {any} */ s) =>
		String(s.id).endsWith('atproto_pds')
	);
	if (!svc) throw new Error('DID document lists no PDS service');
	return { did, pds: String(svc.serviceEndpoint).replace(/\/$/, '') };
}
