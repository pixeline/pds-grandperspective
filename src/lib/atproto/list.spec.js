import { describe, it, expect } from 'vitest';
import { listAllRecords } from './list.js';

const NOW = Date.parse('2026-07-30T00:00:00Z');
const DID = 'did:plc:abc';

/** A fake PDS holding fixed pages, so pagination is exercised for real. */
function fakePds({ collections, pages }) {
	return async (url) => {
		const u = new URL(url);
		if (u.pathname.endsWith('describeRepo')) {
			return new Response(JSON.stringify({ collections }), { status: 200 });
		}
		const col = u.searchParams.get('collection');
		const cursor = u.searchParams.get('cursor') ?? '';
		const page = pages[col]?.[cursor];
		return new Response(JSON.stringify(page ?? { records: [] }), { status: 200 });
	};
}

const rec = (col, rkey, value) => ({ uri: `at://${DID}/${col}/${rkey}`, value });

describe('listAllRecords', () => {
	it('pages a collection to exhaustion, following cursors', async () => {
		const fetchImpl = fakePds({
			collections: ['a.b.c'],
			pages: {
				'a.b.c': {
					'': { records: [rec('a.b.c', '3lkwkzb3az22s', { $type: 'a.b.c' })], cursor: 'p2' },
					p2: { records: [rec('a.b.c', '3lkwkzb3az22t', { $type: 'a.b.c' })] }
				}
			}
		});

		const out = await listAllRecords('https://pds.test', DID, { fetchImpl, now: NOW });

		expect(out.records).toHaveLength(2);
		expect(out.collections).toEqual(['a.b.c']);
	});

	// no ceiling: every collection is read to exhaustion, so read order cannot
	// change the result and the round-robin is not needed
	it('reads every collection completely', async () => {
		const fetchImpl = fakePds({
			collections: ['a.b.big', 'a.b.small'],
			pages: {
				'a.b.big': {
					'': {
						records: Array.from({ length: 3 }, (_, i) =>
							rec('a.b.big', `3lkwkzb3az2${i}s`, { $type: 'a.b.big' })
						)
					}
				},
				'a.b.small': {
					'': { records: [rec('a.b.small', '3lkwkzb3az22s', { $type: 'a.b.small' })] }
				}
			}
		});

		const out = await listAllRecords('https://pds.test', DID, { fetchImpl, now: NOW });

		expect(out.records.filter((r) => r.col === 'a.b.big')).toHaveLength(3);
		expect(out.records.filter((r) => r.col === 'a.b.small')).toHaveLength(1);
	});

	// describeRepo can declare a collection that turns out to hold zero
	// records. `collections` must reflect what was actually observed, matching
	// car.js's walkRecords -- otherwise the same repo reports a different
	// collection count depending on which reader ran.
	it('excludes a declared collection that turns out to be empty', async () => {
		const fetchImpl = fakePds({
			collections: ['a.b.c', 'a.b.empty'],
			pages: {
				'a.b.c': { '': { records: [rec('a.b.c', '3lkwkzb3az22s', { $type: 'a.b.c' })] } },
				'a.b.empty': { '': { records: [] } }
			}
		});

		const out = await listAllRecords('https://pds.test', DID, { fetchImpl, now: NOW });

		expect(out.collections).toEqual(['a.b.c']);
	});

	it('marks sizes as estimated, not measured', async () => {
		const value = { $type: 'a.b.c', text: 'hello' };
		const fetchImpl = fakePds({
			collections: ['a.b.c'],
			pages: { 'a.b.c': { '': { records: [rec('a.b.c', '3lkwkzb3az22s', value)] } } }
		});

		const out = await listAllRecords('https://pds.test', DID, { fetchImpl, now: NOW });

		expect(out.records[0].exact).toBe(false);
		expect(out.records[0].bytes).toBe(JSON.stringify(value).length);
	});

	// The real-world shape this guards: `blue.linkat.board/self`,
	// `chat.bsky.actor.declaration/self`, and 23 others on a live repo -- a
	// singleton config record with a non-TID rkey and no createdAt. It must
	// survive (not be dropped by a reintroduced `if (ts == null) continue`)
	// and must sort last (not be treated as oldest by a reintroduced
	// `a.ts - b.ts` or `?? 0`).
	it('keeps an undated self-keyed record and sorts it last', async () => {
		const dated = rec('a.b.c', '3lkwkzb3az22s', { $type: 'a.b.c' });
		const undated = rec('a.b.c', 'self', { $type: 'a.b.c' }); // no createdAt, not a TID
		const fetchImpl = fakePds({
			collections: ['a.b.c'],
			pages: { 'a.b.c': { '': { records: [dated, undated] } } }
		});

		const out = await listAllRecords('https://pds.test', DID, { fetchImpl, now: NOW });

		// 1. survives -- catches a reintroduced `if (ts == null) continue`
		expect(out.records).toHaveLength(2);

		// 2. genuinely undated, not coerced to a real timestamp
		const self = out.records.find((r) => r.rkey === 'self');
		expect(self.ts).toBe(null);

		// 3. sorted last -- catches a reintroduced `a.ts - b.ts` or `?? 0`,
		// either of which would place the undated record first (NaN or epoch 0)
		expect(out.records.at(-1).rkey).toBe('self');
	});

	it('refuses an empty repo loudly', async () => {
		const fetchImpl = fakePds({ collections: [], pages: {} });
		await expect(
			listAllRecords('https://pds.test', DID, { fetchImpl, now: NOW })
		).rejects.toThrow('no collections');
	});
});
