import { describe, it, expect } from 'vitest';
import { BlockMap, blocksToCarFile, MemoryBlockstore, Repo } from '@atproto/repo';
import { Secp256k1Keypair } from '@atproto/crypto';
import { parseRepoCar, carUrl, fetchCarBytes } from './car.js';

const NOW = Date.parse('2026-07-30T00:00:00Z');

/** Build a real CAR containing the given records. */
async function fixtureCar(writes) {
	const keypair = await Secp256k1Keypair.create();
	const storage = new MemoryBlockstore();
	const repo = await Repo.create(storage, 'did:plc:testtesttesttesttesttest', keypair, writes);
	const blocks = new BlockMap();
	for (const [cid, bytes] of storage.blocks) blocks.set(cid, bytes);
	return blocksToCarFile(repo.cid, blocks);
}

const write = (collection, rkey, record) => ({ action: 'create', collection, rkey, record });

describe('carUrl', () => {
	it('builds an unauthenticated getRepo url', () => {
		expect(carUrl('https://eurosky.social', 'did:plc:abc')).toBe(
			'https://eurosky.social/xrpc/com.atproto.sync.getRepo?did=did%3Aplc%3Aabc'
		);
	});
});

describe('parseRepoCar', () => {
	it('recovers every record with its collection and rkey', async () => {
		const car = await fixtureCar([
			write('app.bsky.feed.post', '3lkwkzb3az22s', {
				$type: 'app.bsky.feed.post',
				text: 'hello',
				createdAt: '2026-01-01T00:00:00Z'
			}),
			write('my.custom.thing', 'self', { $type: 'my.custom.thing', n: 1 })
		]);

		const out = await parseRepoCar(car, { now: NOW });

		expect(out.records).toHaveLength(2);
		expect(out.collections).toEqual(['app.bsky.feed.post', 'my.custom.thing']);
		const post = out.records.find((r) => r.col === 'app.bsky.feed.post');
		expect(post.rkey).toBe('3lkwkzb3az22s');
		expect(post.value.text).toBe('hello');
	});

	// the whole reason the CAR path is primary: this is a measurement, not an
	// estimate, and it is what the treemap sizes cells by
	it('reports the stored DAG-CBOR block length, not the JSON length', async () => {
		const value = { $type: 'my.custom.thing', text: 'x'.repeat(500) };
		const car = await fixtureCar([write('my.custom.thing', 'self', value)]);

		const out = await parseRepoCar(car, { now: NOW });

		expect(out.records[0].exact).toBe(true);
		expect(out.records[0].bytes).toBeGreaterThan(0);
		// CBOR is more compact than JSON, so stored must be strictly smaller
		expect(out.records[0].bytes).toBeLessThan(JSON.stringify(value).length);
	});

	it('carries the repo did and revision', async () => {
		const car = await fixtureCar([write('my.custom.thing', 'self', { $type: 'my.custom.thing' })]);
		const out = await parseRepoCar(car, { now: NOW });
		expect(out.did).toBe('did:plc:testtesttesttesttesttest');
		expect(out.rev).toMatch(/^[a-z0-9]+$/);
	});

	it('audits records as it walks them', async () => {
		const car = await fixtureCar([
			write('my.custom.thing', 'self', { $type: 'wrong.type.here' })
		]);
		const out = await parseRepoCar(car, { now: NOW });
		expect(out.records[0].errNames).toContain('$type ≠ collection');
		expect(out.records[0].errs).toBe(1);
	});

	it('sorts records ascending by timestamp', async () => {
		const car = await fixtureCar([
			write('a.b.c', '3lkwkzb3az22s', { $type: 'a.b.c' }),
			write('a.b.c', '3kkwkzb3az22s', { $type: 'a.b.c' })
		]);
		const out = await parseRepoCar(car, { now: NOW });
		expect(out.records[0].ts).toBeLessThanOrEqual(out.records[1].ts);
	});

	it('raises on a truncated CAR rather than returning a partial repo', async () => {
		const car = await fixtureCar([write('a.b.c', 'self', { $type: 'a.b.c' })]);
		await expect(parseRepoCar(car.slice(0, Math.floor(car.length / 2)))).rejects.toThrow();
	});

	// singleton config records ("self" rkey, no createdAt) have no decodable
	// timestamp at all -- they must survive the walk with ts: null rather than
	// being dropped, and must not be mistaken for the oldest record in the repo
	it('keeps a record with no decodable timestamp, and sorts it after dated ones', async () => {
		const car = await fixtureCar([
			write('a.b.c', '3lkwkzb3az22s', { $type: 'a.b.c', createdAt: '2026-01-01T00:00:00Z' }),
			write('app.bsky.actor.profile', 'self', { $type: 'app.bsky.actor.profile' })
		]);
		const out = await parseRepoCar(car, { now: NOW });

		expect(out.records).toHaveLength(2);
		const undated = out.records.find((r) => r.col === 'app.bsky.actor.profile');
		expect(undated.ts).toBeNull();
		expect(out.records[out.records.length - 1]).toBe(undated);
	});
});

describe('fetchCarBytes', () => {
	function streamResponse(chunks) {
		return new Response(
			new ReadableStream({
				start(c) {
					for (const ch of chunks) c.enqueue(ch);
					c.close();
				}
			})
		);
	}

	it('concatenates a chunked body and reports progress', async () => {
		const chunks = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5])];
		const seen = [];
		const bytes = await fetchCarBytes('https://example.test/car', {
			onProgress: (n) => seen.push(n),
			fetchImpl: async () => streamResponse(chunks)
		});
		expect([...bytes]).toEqual([1, 2, 3, 4, 5]);
		expect(seen).toEqual([3, 5]);
	});

	// getRepo sends no Content-Length, so the only way to gate size is to count
	// while streaming and abort
	it('throws size-limit once the running total is exceeded', async () => {
		const chunks = [new Uint8Array(10), new Uint8Array(10)];
		await expect(
			fetchCarBytes('https://example.test/car', {
				limitBytes: 15,
				fetchImpl: async () => streamResponse(chunks)
			})
		).rejects.toThrow('size-limit');
	});

	it('continues when the size gate says so, and honours a refusal', async () => {
		const chunks = [new Uint8Array(10), new Uint8Array(10)];
		const bytes = await fetchCarBytes('https://example.test/car', {
			limitBytes: 15,
			onSizeGate: async () => true,
			fetchImpl: async () => streamResponse(chunks)
		});
		expect(bytes.length).toBe(20);

		await expect(
			fetchCarBytes('https://example.test/car', {
				limitBytes: 15,
				onSizeGate: async () => false,
				fetchImpl: async () => streamResponse(chunks)
			})
		).rejects.toThrow('size-limit');
	});

	it('reports a non-200 with its status', async () => {
		await expect(
			fetchCarBytes('https://example.test/car', {
				fetchImpl: async () => new Response('nope', { status: 404 })
			})
		).rejects.toThrow('404');
	});
});
