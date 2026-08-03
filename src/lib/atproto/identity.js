/**
 * Identity resolution: handle → DID → PDS endpoint.
 * Public XRPC reads need no auth, so all of this runs in the browser.
 */

/**
 * @param {string} url
 * @param {{signal?: AbortSignal, fetchImpl?: typeof fetch}} [opts]
 */
export async function jget(url, opts = {}) {
	const { signal, fetchImpl = fetch } = opts;
	const r = await fetchImpl(url, { signal });
	if (!r.ok) throw new Error(`${r.status} from ${new URL(url).host}`);
	return r.json();
}

/** @param {string} did */
async function fetchDidDoc(did, opts) {
	if (did.startsWith('did:plc:')) return jget(`https://plc.directory/${did}`, opts);
	if (did.startsWith('did:web:')) {
		// did:web:example.com:path → https://example.com/path/.well-known/did.json
		const host = did.slice(8).replace(/:/g, '/');
		return jget(`https://${host}/.well-known/did.json`, opts);
	}
	throw new Error(`Unsupported DID method: ${did.split(':')[1]}`);
}

/**
 * @param {string} input handle, @handle or did
 * @param {{signal?: AbortSignal, fetchImpl?: typeof fetch}} [opts]
 * @returns {Promise<{did: string, pds: string, handle: string|null}>}
 */
export async function resolveIdentity(input, opts = {}) {
	const cleaned = input.trim().replace(/^@/, '');
	let did = cleaned;
	// A handle is what the caller typed, kept only when there actually was one
	// to resolve from -- a bare DID input has no handle to show, and inventing
	// one (e.g. from a later profile lookup) is exactly the kind of "looks
	// authoritative, isn't" bug this function exists to avoid.
	let handle = null;
	if (!did.startsWith('did:')) {
		const j = await jget(
			`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(did)}`,
			opts
		);
		did = j.did;
		handle = cleaned;
	}
	const doc = await fetchDidDoc(did, opts);
	const svc = (doc.service || []).find((/** @type {any} */ s) =>
		String(s.id).endsWith('atproto_pds')
	);
	if (!svc) throw new Error('DID document lists no PDS service');

	const pds = String(svc.serviceEndpoint).replace(/\/$/, '');
	// the DID document is untrusted third-party input; only https is acceptable
	if (!pds.startsWith('https://')) throw new Error(`PDS endpoint is not https: ${pds}`);

	return { did, pds, handle };
}
