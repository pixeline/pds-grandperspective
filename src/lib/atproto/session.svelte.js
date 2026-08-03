import { BrowserOAuthClient } from '@atproto/oauth-client-browser';

/**
 * The client_id IS the URL the metadata is served from. Moving the app
 * invalidates every existing OAuth session, which is why the deployment path
 * is a decision rather than a detail.
 */
export const CLIENT_ID =
	'https://pixeline.be/pds-grandperspective/oauth-client-metadata.json';

/**
 * Exactly what this app does and nothing else: update and delete records in
 * any collection.
 *
 * The wildcard is necessary -- granular repo:<nsid> scopes must name
 * collections in static metadata, and this tool acts on lexicons it has never
 * seen (195 collections on one test repo, a different set per user). The
 * permission spec permits the full wildcard `repo:*` while prohibiting partial
 * ones like `repo:app.bsky.*`.
 *
 * This is deliberately narrower than transition:generic, which would also
 * grant blob upload, preferences read/write, service proxying and service-auth
 * token generation. `create` is absent because the app never creates records.
 */
export const SCOPE = 'atproto repo:*?action=update&action=delete';

/**
 * Did the authorization server actually grant repo writes?
 *
 * Read the granted scope from the SDK's token info, never from a guessed
 * field: `session.scope` does not exist on every session type, and reading it
 * yields undefined. Defaulting undefined to "allowed" would show Edit and
 * Delete buttons backed by no grant at all.
 *
 * @param {string|null|undefined} granted
 */
export function hasRepoWrite(granted) {
	if (!granted) return false;
	const scopes = granted.split(/\s+/).filter(Boolean);
	return scopes.some((s) => {
		if (s === 'transition:generic') return true;
		if (s === 'repo:*') return true;
		if (!s.startsWith('repo:*?')) return false;
		const actions = new URLSearchParams(s.slice(s.indexOf('?') + 1)).getAll('action');
		return actions.includes('update') || actions.includes('delete');
	});
}

/**
 * In development the special loopback client is used. The redirect URI must
 * use the literal IP 127.0.0.1 -- the spec rejects the hostname `localhost`
 * for this client, and the resulting error is confusing to diagnose.
 */
function clientId() {
	if (typeof location === 'undefined') return CLIENT_ID;
	const isLoopback = location.hostname === '127.0.0.1' || location.hostname === '[::1]';
	if (!isLoopback) return CLIENT_ID;
	const redirect = encodeURIComponent(`${location.origin}/`);
	return `http://localhost?redirect_uri=${redirect}&scope=${encodeURIComponent(SCOPE)}`;
}

/**
 * Sign-in state as a rune-backed store.
 *
 * `init()` MUST run before the app reads the URL hash: the OAuth callback
 * arrives as ?code=…&state=… on the same route, and letting the hash restore
 * run first races it.
 */
export function createSessionStore() {
	let client = null;
	let agent = $state(null);
	let did = $state(null);
	let handle = $state(null);
	let canWrite = $state(false);
	let error = $state(null);

	return {
		get did() { return did; },
		get handle() { return handle; },
		get canWrite() { return canWrite; },
		get agent() { return agent; },
		get error() { return error; },

		async init() {
			error = null;
			try {
				client = await BrowserOAuthClient.load({
					clientId: clientId(),
					handleResolver: 'https://public.api.bsky.app'
				});
				const result = await client.init();
				if (!result?.session) return;

				agent = result.session;
				did = result.session.did;

				// OAuthSession.getTokenInfo() returns {scope, iss, aud, sub, …} --
				// read the grant from there, never from a guessed session field
				const info = await result.session.getTokenInfo().catch(() => null);
				canWrite = hasRepoWrite(info?.scope);

				const prof = await fetch(
					`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${did}`
				)
					.then((r) => (r.ok ? r.json() : null))
					.catch(() => null);
				handle = prof?.handle ?? did;
			} catch (e) {
				error = String(e?.message ?? e);
			}
		},

		// Failures here MUST land in `error`, the same as init() -- signIn()
		// used to let a rejection escape as an unhandled promise rejection,
		// which +page.svelte called without a catch, so a bad handle produced
		// no visible feedback at all. Every exit from this function either
		// starts a navigation away (success) or sets `error` (failure); never
		// both silent.
		async signIn(input) {
			error = null;
			const cleaned = String(input ?? '').trim().replace(/^@/, '');
			if (!cleaned) {
				error = 'Enter a handle or DID to sign in with.';
				return;
			}
			if (!client) {
				error = 'Session is still initialising. Try again in a moment.';
				return;
			}
			try {
				await client.signIn(cleaned, { scope: SCOPE });
			} catch (e) {
				error = String(e?.message ?? e);
			}
		},

		async signOut() {
			error = null;
			try {
				await agent?.signOut?.();
			} catch (e) {
				error = String(e?.message ?? e);
			}
			agent = null;
			did = null;
			handle = null;
			canWrite = false;
		}
	};
}
