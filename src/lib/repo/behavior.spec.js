import { describe, it, expect } from 'vitest';
import { behaviorVector, RAY_ORDER } from './behavior.js';

/** Build records; `value` optional for post-splitting cases. */
function recs(list) {
	let t = Date.parse('2026-01-01T00:00:00Z');
	return list.map(([col, value]) => ({ col, ts: (t += 1000), rkey: `${col}-${t}`, value }));
}

describe('behaviorVector', () => {
	it('has a stable seven-ray order', () => {
		expect(RAY_ORDER).toEqual([
			'create', 'converse', 'amplify', 'react', 'curate', 'connect', 'identity'
		]);
	});

	it('splits feed.post by value: quote → amplify, reply → converse, else create', () => {
		const v = behaviorVector(recs([
			['app.bsky.feed.post', {}],
			['app.bsky.feed.post', { reply: { parent: {}, root: {} } }],
			['app.bsky.feed.post', { embed: { $type: 'app.bsky.embed.record' } }],
			['app.bsky.feed.post', { reply: {}, embed: { $type: 'app.bsky.embed.recordWithMedia' } }]
		]));
		expect(v.create).toBe(1);
		expect(v.converse).toBe(1);
		expect(v.amplify).toBe(2); // quote wins even when it is also a reply
	});

	it('maps known Bluesky lexicons to their rays', () => {
		const v = behaviorVector(recs([
			['app.bsky.feed.like'], ['app.bsky.feed.repost'],
			['app.bsky.graph.follow'], ['app.bsky.graph.block'],
			['app.bsky.graph.list'], ['app.bsky.feed.generator'],
			['app.bsky.actor.profile'], ['com.whtwnd.blog.entry']
		]));
		expect(v.react).toBe(1);
		expect(v.amplify).toBe(1);
		expect(v.connect).toBe(2);
		expect(v.curate).toBe(2);
		expect(v.identity).toBe(1);
		expect(v.create).toBe(1); // whtwnd long-form
	});

	it('classifies unknown apps by leaf verb', () => {
		const v = behaviorVector(recs([
			['sh.tangled.feed.star'],           // unknown leaf → unclassified
			['events.smokesignal.calendar.rsvp'], // unknown leaf → unclassified
			['com.example.custom.like'],        // leaf like → react
			['com.example.blog.post']           // leaf post → create
		]));
		expect(v.react).toBe(1);
		expect(v.create).toBe(1);
		expect(v.unclassified).toBe(2);
		expect(v.unclassifiedCols).toEqual([
			'events.smokesignal.calendar.rsvp', 'sh.tangled.feed.star'
		]);
	});

	it('records the most recent ts per ray in lastActive', () => {
		const v = behaviorVector([
			{ col: 'app.bsky.feed.like', ts: 100, rkey: 'a', value: {} },
			{ col: 'app.bsky.feed.like', ts: 500, rkey: 'b', value: {} },
			{ col: 'app.bsky.feed.like', ts: 300, rkey: 'c', value: {} }
		]);
		expect(v.lastActive.react).toBe(500);
		expect(v.lastActive.create).toBeNull();
	});

	it('is all-zero for an empty repo', () => {
		const v = behaviorVector([]);
		expect(RAY_ORDER.every((k) => v[k] === 0)).toBe(true);
		expect(v.unclassified).toBe(0);
	});
});

import { dominantType, describeType } from './behavior.js';

describe('dominantType', () => {
	const zero = behaviorVector([]);

	it('flags the over-indexed mode, not the raw plurality', () => {
		// likes are the raw plurality, but posting sits far above its baseline
		const v = { ...zero, react: 900, create: 100 };
		expect(dominantType(v)).toEqual({ ray: 'create', label: 'Broadcaster' });
	});

	it('calls an all-likes account a Listener', () => {
		const v = { ...zero, react: 1000 };
		expect(dominantType(v)).toEqual({ ray: 'react', label: 'Listener' });
	});

	it('calls a baseline-shaped account a Generalist', () => {
		// counts in the same proportions as TYPICAL → every mode indexes ~1.0
		const v = { ...zero, react: 720, connect: 130, create: 55, amplify: 45, converse: 30, curate: 10, identity: 10 };
		expect(dominantType(v)).toEqual({ ray: 'generalist', label: 'Generalist' });
	});

	it('calls an identity-only repo a Newcomer', () => {
		const v = { ...zero, identity: 1 };
		expect(dominantType(v)).toEqual({ ray: 'identity', label: 'Newcomer' });
	});

	it('has no type for an empty repo', () => {
		expect(dominantType(zero)).toEqual({ ray: null, label: '—' });
	});
});

describe('describeType', () => {
	it('gives a line for each named type, and none for the empty case', () => {
		expect(describeType('create')).toMatch(/post/i);
		expect(describeType('generalist')).toMatch(/stand/i);
		expect(describeType(null)).toBe('');
	});
});
