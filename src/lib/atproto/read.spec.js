import { describe, it, expect, vi } from 'vitest';
import { readRepo } from './read.js';

const NOW = Date.parse('2026-07-30T00:00:00Z');
const DID = 'did:plc:abc';
const PDS = 'https://pds.test';

/** Route the fixed URLs the read path visits; unknown urls fail loudly. */
function routes({ car, describeRepo, listRecords }) {
	return async (url) => {
		const u = String(url);
		if (u.includes('resolveHandle')) return new Response(JSON.stringify({ did: DID }));
		if (u.includes('plc.directory')) {
			return new Response(
				JSON.stringify({ service: [{ id: '#atproto_pds', serviceEndpoint: PDS }] })
			);
		}
		if (u.includes('sync.getRepo')) return car();
		if (u.includes('describeRepo')) return describeRepo();
		if (u.includes('listRecords')) return listRecords();
		throw new Error(`unexpected url ${u}`);
	};
}

const ok = (body) => new Response(JSON.stringify(body), { status: 200 });

describe('readRepo', () => {
	it('falls back to listRecords when the CAR endpoint fails', async () => {
		const fetchImpl = routes({
			car: () => new Response('nope', { status: 404 }),
			describeRepo: () => ok({ collections: ['a.b.c'] }),
			listRecords: () =>
				ok({
					records: [{ uri: `at://${DID}/a.b.c/3lkwkzb3az22s`, value: { $type: 'a.b.c' } }]
				})
		});

		const out = await readRepo('alice.test', { fetchImpl, now: NOW });

		expect(out.source).toBe('list');
		expect(out.exact).toBe(false);
		expect(out.records).toHaveLength(1);
	});

	it('reports the fallback reason rather than swallowing it', async () => {
		const onProgress = vi.fn();
		const fetchImpl = routes({
			car: () => new Response('nope', { status: 503 }),
			describeRepo: () => ok({ collections: ['a.b.c'] }),
			listRecords: () => ok({ records: [] })
		});

		await readRepo('alice.test', { fetchImpl, now: NOW, onProgress });

		const messages = onProgress.mock.calls.map((c) => c[0].message).join(' ');
		expect(messages).toMatch(/503/);
	});

	it('tallies audit errors across the repo', async () => {
		const fetchImpl = routes({
			car: () => new Response('nope', { status: 404 }),
			describeRepo: () => ok({ collections: ['a.b.c'] }),
			listRecords: () =>
				ok({
					records: [
						{ uri: `at://${DID}/a.b.c/3lkwkzb3az22s`, value: { $type: 'wrong.thing' } },
						{ uri: `at://${DID}/a.b.c/3lkwkzb3az22t`, value: { $type: 'wrong.thing' } }
					]
				})
		});

		const out = await readRepo('alice.test', { fetchImpl, now: NOW });

		expect(out.errorTally.get('$type ≠ collection')).toBe(2);
	});

	it('asks before continuing past the size limit', async () => {
		const onSizeGate = vi.fn(async () => false);
		const fetchImpl = routes({
			car: () =>
				new Response(
					new ReadableStream({
						start(c) {
							c.enqueue(new Uint8Array(100));
							c.close();
						}
					})
				),
			describeRepo: () => ok({ collections: ['a.b.c'] }),
			listRecords: () => ok({ records: [] })
		});

		await expect(
			readRepo('alice.test', { fetchImpl, now: NOW, limitBytes: 10, onSizeGate })
		).rejects.toThrow('size-limit');
		expect(onSizeGate).toHaveBeenCalled();
	});

	it('carries the resolved handle alongside the did', async () => {
		const fetchImpl = routes({
			car: () => new Response('nope', { status: 404 }),
			describeRepo: () => ok({ collections: ['a.b.c'] }),
			listRecords: () => ok({ records: [] })
		});

		const out = await readRepo('alice.test', { fetchImpl, now: NOW });

		expect(out.did).toBe(DID);
		expect(out.handle).toBe('alice.test');
	});

	it('returns a null handle when the input was already a DID', async () => {
		const fetchImpl = routes({
			car: () => new Response('nope', { status: 404 }),
			describeRepo: () => ok({ collections: ['a.b.c'] }),
			listRecords: () => ok({ records: [] })
		});

		const out = await readRepo(DID, { fetchImpl, now: NOW });

		expect(out.did).toBe(DID);
		expect(out.handle).toBeNull();
	});

	it('surfaces a failed identity resolution', async () => {
		const fetchImpl = async () => new Response('no', { status: 400 });
		await expect(readRepo('nope.test', { fetchImpl, now: NOW })).rejects.toThrow();
	});

	it('propagates an aborted signal instead of falling back to listRecords', async () => {
		const controller = new AbortController();
		controller.abort();
		// listRecords would succeed if reached, so a missing abort guard would make
		// readRepo resolve instead of reject.
		const listRecords = vi.fn(() => ok({ records: [] }));
		const fetchImpl = routes({
			car: () => {
				throw new Error('The operation was aborted');
			},
			describeRepo: () => ok({ collections: ['a.b.c'] }),
			listRecords
		});

		await expect(
			readRepo('alice.test', { fetchImpl, now: NOW, signal: controller.signal })
		).rejects.toThrow();
		expect(listRecords).not.toHaveBeenCalled();
	});
});
