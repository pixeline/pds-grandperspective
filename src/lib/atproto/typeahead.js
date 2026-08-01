/**
 * Actor typeahead, via the community service at typeahead.waow.tech.
 * It sends `access-control-allow-origin: *`, so this stays a browser-only read
 * with no server and no credentials.
 */
const ENDPOINT = 'https://typeahead.waow.tech/xrpc/tech.waow.typeahead.searchActors';

/**
 * @param {string} q
 * @param {{limit?:number, signal?:AbortSignal}} [opts]
 * @returns {Promise<Array<{did:string,handle:string,displayName?:string,avatar?:string}>>}
 */
export async function searchActors(q, opts = {}) {
	const query = q.trim().replace(/^@/, '');
	if (!query) return [];
	const url = `${ENDPOINT}?q=${encodeURIComponent(query)}&limit=${opts.limit ?? 8}`;
	const r = await fetch(url, { signal: opts.signal });
	if (!r.ok) throw new Error(`typeahead ${r.status}`);
	const j = await r.json();
	return Array.isArray(j.actors) ? j.actors : [];
}
