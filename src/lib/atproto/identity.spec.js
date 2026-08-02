import { describe, it, expect, vi } from 'vitest';
import { resolveIdentity } from './identity.js';

const DID = 'did:plc:abc';

/** fetchImpl that resolves a handle to DID and serves a did:plc document with one service entry. */
function fetchImplFor(serviceEndpoint, { serviceId = '#atproto_pds' } = {}) {
	return vi.fn(async (url) => {
		const u = String(url);
		if (u.includes('resolveHandle')) return new Response(JSON.stringify({ did: DID }));
		if (u.includes('plc.directory')) {
			const service = serviceEndpoint == null ? [] : [{ id: serviceId, serviceEndpoint }];
			return new Response(JSON.stringify({ service }));
		}
		throw new Error(`unexpected url ${u}`);
	});
}

describe('resolveIdentity', () => {
	it('resolves a normal https endpoint, stripping a trailing slash', async () => {
		const fetchImpl = fetchImplFor('https://pds.test/');
		const out = await resolveIdentity('alice.test', { fetchImpl });
		expect(out).toEqual({ did: DID, pds: 'https://pds.test' });
	});

	it('rejects an http endpoint', async () => {
		const fetchImpl = fetchImplFor('http://pds.test');
		await expect(resolveIdentity('alice.test', { fetchImpl })).rejects.toThrow(/not https/);
	});

	it('rejects a protocol-relative endpoint', async () => {
		const fetchImpl = fetchImplFor('//evil.host');
		await expect(resolveIdentity('alice.test', { fetchImpl })).rejects.toThrow(/not https/);
	});

	it('rejects an endpoint with leading whitespace', async () => {
		// startsWith('https://') fails on this; .includes('https://') would not --
		// this is the test that catches that weakening.
		const fetchImpl = fetchImplFor(' https://pds.test');
		await expect(resolveIdentity('alice.test', { fetchImpl })).rejects.toThrow(/not https/);
	});

	it('throws when the DID document lists no #atproto_pds service', async () => {
		const fetchImpl = fetchImplFor(null);
		await expect(resolveIdentity('alice.test', { fetchImpl })).rejects.toThrow(
			/lists no PDS service/
		);
	});

	it('throws when the DID document only lists an unrelated service', async () => {
		const fetchImpl = fetchImplFor('https://pds.test', { serviceId: '#somethingElse' });
		await expect(resolveIdentity('alice.test', { fetchImpl })).rejects.toThrow(
			/lists no PDS service/
		);
	});

	it('throws on an unsupported DID method rather than silently resolving', async () => {
		const fetchImpl = vi.fn(async (url) => {
			throw new Error(`unexpected url ${url}`);
		});
		await expect(resolveIdentity('did:example:123', { fetchImpl })).rejects.toThrow(
			/Unsupported DID method/
		);
		// an unsupported method is rejected before any network call is attempted
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it('resolves a bare handle through com.atproto.identity.resolveHandle', async () => {
		const fetchImpl = fetchImplFor('https://pds.test');
		await resolveIdentity('alice.test', { fetchImpl });
		const urls = fetchImpl.mock.calls.map((c) => String(c[0]));
		expect(urls.some((u) => u.includes('resolveHandle'))).toBe(true);
	});

	it('skips the handle-resolution call entirely when given a did:plc: input', async () => {
		const fetchImpl = fetchImplFor('https://pds.test');
		await resolveIdentity(DID, { fetchImpl });
		const urls = fetchImpl.mock.calls.map((c) => String(c[0]));
		expect(urls.some((u) => u.includes('resolveHandle'))).toBe(false);
		expect(urls.some((u) => u.includes('plc.directory'))).toBe(true);
	});
});
