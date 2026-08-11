# Atmospheric Polar Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A sidebar panel that draws the loaded repo as a 7-ray polar chart of behavioural activity (Create / Converse / Amplify / React / Curate / Connect / Identity).

**Architecture:** Mirrors the existing `treemap.js → paint.js → component` seam. Two pure modules emit plain data (`behavior.js` counts, `polar.js` geometry), a context-only painter draws it (`polarpaint.js`), and one Svelte component (`PolarProfile.svelte`) hosts a canvas plus hover and an info popover. `+page.svelte` computes the vector once per read; `Rail.svelte` mounts the panel under the sign-in block.

**Tech Stack:** SvelteKit 5 (runes), Vitest 4, Canvas 2D. No new dependencies. No network calls — pure functions of records already in memory.

## Global Constraints

- **Never React. SvelteKit only.**
- **All reading is client-side.** This feature adds no fetch; it consumes `data.records` already read.
- **Every visual property traces to a number.** Ray radius = `log10(count)`; hue = behaviour identity; saturation = recency. Nothing drawn without a source.
- **Hue identifies a category, saturation carries recency, chrome is neutral.** Ray points carry hue+saturation; rings, spokes, labels, polygon = neutral ink; polygon fill = ink at low alpha (belongs to no single behaviour).
- **No rounded corners, drop shadows, gradients, or decorative motion.** Enforced by `src/lib/style.spec.js`, which already scans every `.svelte`/`.css` under `src`. Rings are heptagons (no `arc`/circles), points are squares.
- **Errors and gaps reported, never decorated.** Empty repo draws nothing and says so; unmatched records go to `unclassified`, surfaced only behind the ⓘ popover.
- **Test runner:** `npm test` (vitest `--run`). Specs are colocated `*.spec.js`, `import { describe, it, expect } from 'vitest'`.

**Record shape** (from `car.js`, already in memory after a read):
`{ col: string, rkey: string, ts: number|null, bytes: number, errs: number, errNames: string[], value: any }`. `ts` is already TID-preferred (via `tid.js`); use it directly.

---

### Task 1: `behaviorVector(records)` — classification core

**Files:**
- Create: `src/lib/repo/behavior.js`
- Test: `src/lib/repo/behavior.spec.js`

**Interfaces:**
- Consumes: records `{ col, ts, value }` (other fields ignored).
- Produces:
  - `export const RAY_ORDER = ['create','converse','amplify','react','curate','connect','identity']`
  - `export function behaviorVector(records) → { create:int, converse:int, amplify:int, react:int, curate:int, connect:int, identity:int, unclassified:int, unclassifiedCols:string[], lastActive:{create:number|null, …7 keys} }`

- [ ] **Step 1: Write the failing test**

```js
// src/lib/repo/behavior.spec.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/repo/behavior.spec.js`
Expected: FAIL — `behavior.js` does not exist.

- [ ] **Step 3: Write minimal implementation**

```js
// src/lib/repo/behavior.js
/**
 * Behavioural profile of a repo: classify every emitted record into one of
 * seven participation modes, so the account's *kind* of activity (not just its
 * volume) becomes a shape. Anchored in Forrester's Social Technographics ladder
 * (Li & Bernoff, Groundswell 2008), renamed to atproto record types. Reading
 * and lurking leave no record, so they are unmeasurable and absent by design.
 *
 * Pure: a function of records already in memory after a read. No network.
 */

/** Canonical ray order — the source of truth for the count keys here and for
 *  the geometry (angles, hues) in polar.js. */
export const RAY_ORDER = [
	'create', 'converse', 'amplify', 'react', 'curate', 'connect', 'identity'
];

/** Exact NSID → ray for documented, stable Bluesky lexicons. `feed.post` is
 *  intentionally absent: it is split by value in classify(). */
const KNOWN = new Map([
	['app.bsky.feed.repost', 'amplify'],
	['app.bsky.feed.like', 'react'],
	['app.bsky.graph.list', 'curate'],
	['app.bsky.graph.listitem', 'curate'],
	['app.bsky.graph.starterpack', 'curate'],
	['app.bsky.feed.generator', 'curate'],
	['app.bsky.labeler.service', 'curate'],
	['app.bsky.feed.threadgate', 'curate'],
	['app.bsky.feed.postgate', 'curate'],
	['app.bsky.graph.follow', 'connect'],
	['app.bsky.graph.block', 'connect'],
	['app.bsky.actor.profile', 'identity'],
	['app.bsky.actor.status', 'identity'],
	['chat.bsky.actor.declaration', 'identity'],
	['com.whtwnd.blog.entry', 'create']
]);

/** Last NSID segment → ray, for apps with no explicit rule. Lets the wider
 *  atmosphere light the rays instead of collapsing to Bluesky. */
function heuristicRay(col) {
	const leaf = col.slice(col.lastIndexOf('.') + 1).toLowerCase();
	if (leaf === 'like') return 'react';
	if (leaf === 'repost' || leaf === 'share') return 'amplify';
	if (leaf === 'follow') return 'connect';
	if (leaf === 'post' || leaf === 'entry') return 'create';
	if (leaf === 'profile' || leaf === 'declaration') return 'identity';
	if (leaf === 'list' || leaf === 'generator') return 'curate';
	return null;
}

function isQuote(value) {
	const t = value?.embed?.$type;
	return t === 'app.bsky.embed.record' || t === 'app.bsky.embed.recordWithMedia';
}

/** One record → its ray, or null if nothing claims it. Priority for feed.post:
 *  quote → reply → plain, so a quote-reply counts once, as Amplify. */
function classify(r) {
	if (r.col === 'app.bsky.feed.post') {
		if (isQuote(r.value)) return 'amplify';
		if (r.value?.reply) return 'converse';
		return 'create';
	}
	return KNOWN.get(r.col) ?? heuristicRay(r.col);
}

/**
 * @param {Array<{col: string, ts: number|null, value?: any}>} records
 */
export function behaviorVector(records) {
	const counts = Object.fromEntries(RAY_ORDER.map((k) => [k, 0]));
	const lastActive = Object.fromEntries(RAY_ORDER.map((k) => [k, null]));
	let unclassified = 0;
	const unclassifiedCols = new Set();

	for (const r of records) {
		const ray = classify(r);
		if (ray == null) {
			unclassified++;
			unclassifiedCols.add(r.col);
			continue;
		}
		counts[ray]++;
		if (r.ts != null && (lastActive[ray] == null || r.ts > lastActive[ray])) {
			lastActive[ray] = r.ts;
		}
	}

	return {
		...counts,
		unclassified,
		unclassifiedCols: [...unclassifiedCols].sort(),
		lastActive
	};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/repo/behavior.spec.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/repo/behavior.js src/lib/repo/behavior.spec.js
git commit -m "feat(behavior): classify repo records into seven behavioural rays"
```

---

### Task 2: `dominantType(vector)` — the one-word profile label

**Files:**
- Modify: `src/lib/repo/behavior.js` (append)
- Modify: `src/lib/repo/behavior.spec.js` (append)

**Interfaces:**
- Consumes: a `behaviorVector` result.
- Produces: `export function dominantType(vector) → { ray: string|null, label: string }`. Labels: create→Broadcaster, converse→Host, amplify→Repeater, react→Listener, curate→Curator, connect→Connector, identity→Newcomer; all-zero → `{ ray: null, label: '—' }`. Ties break by `RAY_ORDER` (first wins).

- [ ] **Step 1: Write the failing test** (append to `behavior.spec.js`)

```js
import { dominantType } from './behavior.js';

describe('dominantType', () => {
	const zero = behaviorVector([]);

	it('names the busiest ray', () => {
		const v = { ...zero, react: 900, create: 100 };
		expect(dominantType(v)).toEqual({ ray: 'react', label: 'Listener' });
	});

	it('breaks ties by ray order (create before react)', () => {
		const v = { ...zero, create: 5, react: 5 };
		expect(dominantType(v)).toEqual({ ray: 'create', label: 'Broadcaster' });
	});

	it('calls an identity-led repo a Newcomer', () => {
		const v = { ...zero, identity: 1 };
		expect(dominantType(v)).toEqual({ ray: 'identity', label: 'Newcomer' });
	});

	it('has no type for an empty repo', () => {
		expect(dominantType(zero)).toEqual({ ray: null, label: '—' });
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/repo/behavior.spec.js`
Expected: FAIL — `dominantType` is not exported.

- [ ] **Step 3: Write minimal implementation** (append to `behavior.js`)

```js
const TYPE_LABEL = {
	create: 'Broadcaster',
	converse: 'Host',
	amplify: 'Repeater',
	react: 'Listener',
	curate: 'Curator',
	connect: 'Connector',
	identity: 'Newcomer'
};

/**
 * The single word for a profile: the label of its busiest ray. Ties break by
 * RAY_ORDER (iteration order, strictly-greater replace). A repo with no drawn
 * records has no type.
 * @param {ReturnType<behaviorVector>} vector
 * @returns {{ray: string|null, label: string}}
 */
export function dominantType(vector) {
	let best = null;
	let bestN = 0;
	for (const key of RAY_ORDER) {
		if (vector[key] > bestN) {
			bestN = vector[key];
			best = key;
		}
	}
	return best == null ? { ray: null, label: '—' } : { ray: best, label: TYPE_LABEL[best] };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/repo/behavior.spec.js`
Expected: PASS (10 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/lib/repo/behavior.js src/lib/repo/behavior.spec.js
git commit -m "feat(behavior): derive one-word profile type from dominant ray"
```

---

### Task 3: `polarLayout(vector)` — geometry, log scale, recency

**Files:**
- Create: `src/lib/repo/polar.js`
- Test: `src/lib/repo/polar.spec.js`

**Interfaces:**
- Consumes: `RAY_ORDER` from `behavior.js`; a `behaviorVector` result.
- Produces:
  - `export const RAYS = [{ key, label, hue }, …7]` (golden-angle hues over ray order)
  - `export function radiusFraction(count) → number` (0..1, fixed log, clamped)
  - `export function raySaturation(ts, now) → number` (0..1)
  - `export const SAT_HALF_LIFE_DAYS = 180`
  - `export function polarLayout(vector, {size=220, pad=22, now=Date.now()}) → { size, center:{x,y}, radius, rings:[{r,label}], axes:[{key,label,angle,count,rFrac,x,y,px,py,hue,sat}], polygon:[{x,y}] }`

- [ ] **Step 1: Write the failing test**

```js
// src/lib/repo/polar.spec.js
import { describe, it, expect } from 'vitest';
import { polarLayout, radiusFraction, raySaturation, RAYS, SAT_HALF_LIFE_DAYS } from './polar.js';
import { behaviorVector } from './behavior.js';

const DAY = 86400000;

describe('radiusFraction (fixed log)', () => {
	it('puts one record near centre and 10k at the edge', () => {
		expect(radiusFraction(0)).toBe(0);
		expect(radiusFraction(9999)).toBeCloseTo(1, 3);
	});
	it('clamps above 10k instead of overshooting', () => {
		expect(radiusFraction(1_000_000)).toBe(1);
	});
	it('is monotonic and compresses the tail', () => {
		expect(radiusFraction(100)).toBeGreaterThan(radiusFraction(10));
		expect(radiusFraction(10)).toBeCloseTo(0.25, 2);
	});
});

describe('raySaturation (recency)', () => {
	const now = Date.parse('2026-06-01T00:00:00Z');
	it('is zero for a ray that never happened', () => {
		expect(raySaturation(null, now)).toBe(0);
	});
	it('is full for something done just now', () => {
		expect(raySaturation(now, now)).toBeCloseTo(1, 3);
	});
	it('halves after one half-life', () => {
		expect(raySaturation(now - SAT_HALF_LIFE_DAYS * DAY, now)).toBeCloseTo(0.5, 3);
	});
});

describe('polarLayout', () => {
	const now = Date.parse('2026-06-01T00:00:00Z');
	const vector = behaviorVector([
		{ col: 'app.bsky.feed.like', ts: now, rkey: 'a', value: {} }
	]);
	const layout = polarLayout(vector, { size: 200, pad: 20, now });

	it('has seven axes in ray order with Create at the top (−90°)', () => {
		expect(layout.axes).toHaveLength(7);
		expect(layout.axes[0].key).toBe('create');
		expect(layout.axes[0].angle).toBeCloseTo(-Math.PI / 2, 6);
		expect(layout.axes[0].x).toBeCloseTo(100, 6); // cx, straight up
		expect(layout.axes[0].y).toBeCloseTo(20, 6);  // cy - radius
	});

	it('gives each ray a stable golden-angle hue', () => {
		expect(RAYS[0].hue).toBeCloseTo(0, 6);
		expect(RAYS[1].hue).toBeCloseTo(137.507, 3);
	});

	it('places the data point at the log radius of its count', () => {
		const react = layout.axes.find((a) => a.key === 'react');
		expect(react.count).toBe(1);
		expect(react.rFrac).toBeCloseTo(radiusFraction(1), 6);
		expect(react.sat).toBeCloseTo(1, 3); // liked just now → vivid
	});

	it('emits a polygon point per axis', () => {
		expect(layout.polygon).toHaveLength(7);
		expect(layout.polygon[3]).toEqual({
			x: layout.axes[3].px, y: layout.axes[3].py
		});
	});

	it('has four log rings labelled 10 / 100 / 1k / 10k', () => {
		expect(layout.rings.map((r) => r.label)).toEqual(['10', '100', '1k', '10k']);
		expect(layout.rings[3].r).toBeCloseTo(layout.radius, 6);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/repo/polar.spec.js`
Expected: FAIL — `polar.js` does not exist.

- [ ] **Step 3: Write minimal implementation**

```js
// src/lib/repo/polar.js
/**
 * Geometry for the behavioural polar chart. Pure: counts in, plain coordinates
 * out — no DOM, no context. Mirrors treemap.js so the painter and a future PNG
 * export stay leaf changes.
 */
import { RAY_ORDER } from './behavior.js';

/** Behaviour identity hues: golden-angle over the ray order — the same stable,
 *  well-separated technique hues.js uses for collections. */
export const RAYS = RAY_ORDER.map((key, i) => ({
	key,
	label: key[0].toUpperCase() + key.slice(1),
	hue: (i * 137.507) % 360
}));

const LOG_MAX = Math.log10(10000); // the edge is 10k records

/** count → 0..1 radius fraction on a fixed log scale (shared across accounts). */
export function radiusFraction(count) {
	const f = Math.log10(count + 1) / LOG_MAX;
	return f < 0 ? 0 : f > 1 ? 1 : f;
}

export const SAT_HALF_LIFE_DAYS = 180;
const DAY = 86400000;

/** recency → 0..1 saturation. Active now → vivid; dormant → grey; never → 0.
 *  The half-life, not the exact number, is the load-bearing decision. */
export function raySaturation(ts, now) {
	if (ts == null) return 0;
	const ageDays = Math.max(0, (now - ts) / DAY);
	return Math.pow(0.5, ageDays / SAT_HALF_LIFE_DAYS);
}

const RINGS = [
	{ count: 10, label: '10' },
	{ count: 100, label: '100' },
	{ count: 1000, label: '1k' },
	{ count: 10000, label: '10k' }
];

/**
 * @param {ReturnType<import('./behavior.js').behaviorVector>} vector
 * @param {{size?: number, pad?: number, now?: number}} [opts]
 */
export function polarLayout(vector, opts = {}) {
	const size = opts.size ?? 220;
	const pad = opts.pad ?? 22;
	const now = opts.now ?? Date.now();
	const cx = size / 2;
	const cy = size / 2;
	const R = size / 2 - pad;
	const step = (2 * Math.PI) / RAY_ORDER.length;
	const angleOf = (i) => -Math.PI / 2 + i * step; // Create straight up, clockwise

	const axes = RAYS.map((ray, i) => {
		const a = angleOf(i);
		const count = vector[ray.key];
		const rFrac = radiusFraction(count);
		const r = R * rFrac;
		return {
			key: ray.key,
			label: ray.label,
			angle: a,
			count,
			rFrac,
			x: cx + R * Math.cos(a), // outer end of the spoke
			y: cy + R * Math.sin(a),
			px: cx + r * Math.cos(a), // plotted data point
			py: cy + r * Math.sin(a),
			hue: ray.hue,
			sat: raySaturation(vector.lastActive[ray.key], now)
		};
	});

	return {
		size,
		center: { x: cx, y: cy },
		radius: R,
		rings: RINGS.map((ring) => ({ r: R * radiusFraction(ring.count), label: ring.label })),
		axes,
		polygon: axes.map((a) => ({ x: a.px, y: a.py }))
	};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/repo/polar.spec.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/repo/polar.js src/lib/repo/polar.spec.js
git commit -m "feat(polar): log-radius geometry with behaviour hue and recency saturation"
```

---

### Task 4: `paintPolar(ctx, layout)` — the context-only painter

**Files:**
- Create: `src/lib/repo/polarpaint.js`
- Test: `src/lib/repo/polarpaint.spec.js`

**Interfaces:**
- Consumes: a `polarLayout` result; a `{ ink, inkSoft, fill }` colour triple.
- Produces: `export function paintPolar(ctx, layout, colors) → void`. Draws heptagon rings + spokes + data polygon (fill `colors.fill`, stroke `colors.ink`) + one hue/saturation square per ray. Uses no `arc` (no circles), so the neutral-chrome + no-rounded rules hold.

- [ ] **Step 1: Write the failing test**

```js
// src/lib/repo/polarpaint.spec.js
import { describe, it, expect } from 'vitest';
import { paintPolar } from './polarpaint.js';
import { polarLayout } from './polar.js';
import { behaviorVector } from './behavior.js';

/** A 2D-context stub that records the calls the painter makes. */
function stubCtx() {
	const calls = { fillRect: 0, arc: 0, closePath: 0, stroke: 0, fill: 0 };
	return {
		calls,
		beginPath() {}, moveTo() {}, lineTo() {},
		closePath() { calls.closePath++; },
		stroke() { calls.stroke++; },
		fill() { calls.fill++; },
		arc() { calls.arc++; },
		fillRect() { calls.fillRect++; },
		set strokeStyle(_) {}, set fillStyle(_) {}, set lineWidth(_) {}
	};
}

describe('paintPolar', () => {
	const layout = polarLayout(behaviorVector([
		{ col: 'app.bsky.feed.like', ts: 1, rkey: 'a', value: {} }
	]), { size: 200 });
	const colors = { ink: '#000', inkSoft: '#888', fill: 'rgba(0,0,0,0.1)' };

	it('draws one hue square per ray and never a circle', () => {
		const ctx = stubCtx();
		paintPolar(ctx, layout, colors);
		expect(ctx.calls.fillRect).toBe(7); // seven data points, as squares
		expect(ctx.calls.arc).toBe(0);      // heptagon rings, no circles
	});

	it('closes every ring and the data polygon', () => {
		const ctx = stubCtx();
		paintPolar(ctx, layout, colors);
		expect(ctx.calls.closePath).toBe(5); // 4 rings + 1 polygon
		expect(ctx.calls.fill).toBeGreaterThanOrEqual(1); // polygon fill
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/repo/polarpaint.spec.js`
Expected: FAIL — `polarpaint.js` does not exist.

- [ ] **Step 3: Write minimal implementation**

```js
// src/lib/repo/polarpaint.js
/**
 * Draw a polar layout to any 2D context. Context in, nothing out — the same
 * seam as paint.js, so an offscreen context yields a PNG avatar with no new
 * code. Chrome is neutral ink; only the data points carry behaviour hue and
 * recency. Rings are heptagons (no circles) and points are squares, so the
 * no-rounded / neutral-chrome rules hold.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {ReturnType<import('./polar.js').polarLayout>} layout
 * @param {{ink: string, inkSoft: string, fill: string}} colors
 */
export function paintPolar(ctx, layout, colors) {
	const { center, axes, polygon, rings } = layout;

	const heptagon = (rad, stroke) => {
		ctx.beginPath();
		axes.forEach((a, i) => {
			const x = center.x + rad * Math.cos(a.angle);
			const y = center.y + rad * Math.sin(a.angle);
			if (i === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		});
		ctx.closePath();
		ctx.strokeStyle = stroke;
		ctx.lineWidth = 1;
		ctx.stroke();
	};

	for (const r of rings) heptagon(r.r, colors.inkSoft); // concentric gridlines

	ctx.strokeStyle = colors.inkSoft; // spokes
	ctx.lineWidth = 1;
	for (const a of axes) {
		ctx.beginPath();
		ctx.moveTo(center.x, center.y);
		ctx.lineTo(a.x, a.y);
		ctx.stroke();
	}

	ctx.beginPath(); // data polygon
	polygon.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
	ctx.closePath();
	ctx.fillStyle = colors.fill;
	ctx.fill();
	ctx.strokeStyle = colors.ink;
	ctx.lineWidth = 1.5;
	ctx.stroke();

	for (const a of axes) { // data points: hue = behaviour, saturation = recency
		ctx.fillStyle = `hsl(${a.hue.toFixed(1)} ${(a.sat * 70).toFixed(0)}% 50%)`;
		ctx.fillRect(a.px - 2.5, a.py - 2.5, 5, 5);
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/repo/polarpaint.spec.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/repo/polarpaint.js src/lib/repo/polarpaint.spec.js
git commit -m "feat(polar): context-only painter for the behavioural chart"
```

---

### Task 5: `PolarProfile.svelte` panel + wire into the page and rail

**Files:**
- Create: `src/lib/components/PolarProfile.svelte`
- Modify: `src/routes/+page.svelte` (compute vector, pass to Rail)
- Modify: `src/lib/components/Rail.svelte` (accept prop, mount panel under the Repository group)

**Interfaces:**
- Consumes: `behaviorVector`, `dominantType` (behavior.js); `polarLayout` (polar.js); `paintPolar` (polarpaint.js).
- Produces: `<PolarProfile vector={…} />` — a self-contained sidebar panel. No new exports.

**Note on testing:** this repo has no Svelte component test harness (all specs are pure modules), so this task is verified in the browser preview, not by a unit test. The four pure modules it composes are already fully tested.

- [ ] **Step 1: Create the component**

Write `src/lib/components/PolarProfile.svelte` as this single complete file:

```svelte
<!-- src/lib/components/PolarProfile.svelte -->
<script>
	import { polarLayout } from '$lib/repo/polar.js';
	import { paintPolar } from '$lib/repo/polarpaint.js';
	import { dominantType } from '$lib/repo/behavior.js';
	import { fmtNum } from '$lib/repo/format.js';

	/** @type {{ vector: any, size?: number }} */
	let { vector = null, size = 220 } = $props();

	let canvas = $state(null);
	let hover = $state(null); // the axis under the pointer, or null
	let showInfo = $state(false);

	const totalDrawn = $derived(
		vector ? ['create','converse','amplify','react','curate','connect','identity']
			.reduce((s, k) => s + vector[k], 0) : 0
	);
	const type = $derived(vector ? dominantType(vector) : { ray: null, label: '—' });
	const layout = $derived(vector ? polarLayout(vector, { size }) : null);

	const inkOf = (name) =>
		getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000';

	// Draw whenever the layout changes. Neutral chrome comes from CSS vars so the
	// chart follows the app's light/dark ink like every other surface.
	$effect(() => {
		if (!canvas || !layout || totalDrawn === 0) return;
		const ratio = window.devicePixelRatio || 1;
		canvas.width = size * ratio;
		canvas.height = size * ratio;
		const ctx = canvas.getContext('2d');
		ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
		ctx.clearRect(0, 0, size, size);
		paintPolar(ctx, layout, {
			ink: inkOf('--ink'),
			inkSoft: inkOf('--ink-soft'),
			fill: 'color-mix(in srgb, var(--ink) 12%, transparent)'
		});
	});

	// Pointer → nearest axis by angle (cheaper and steadier than point distance
	// in a small chart). Only registers a hover inside the plot radius.
	function onMove(e) {
		if (!layout) return;
		const rect = canvas.getBoundingClientRect();
		const mx = e.clientX - rect.left;
		const my = e.clientY - rect.top;
		const dx = mx - layout.center.x;
		const dy = my - layout.center.y;
		if (Math.hypot(dx, dy) > layout.radius + 8) { hover = null; return; }
		let ang = Math.atan2(dy, dx) + Math.PI / 2; // 0 at the top
		if (ang < 0) ang += 2 * Math.PI;
		const i = Math.round(ang / ((2 * Math.PI) / 7)) % 7;
		hover = layout.axes[i];
	}

	const asDate = (ts) => (ts == null ? '—' : new Date(ts).toISOString().slice(0, 10));
</script>

<section class="polar" aria-label="Behavioural profile">
	<div class="cap">
		<span class="lbl">Behaviour</span>
		<button
			class="info"
			aria-label="About this chart"
			onclick={() => (showInfo = !showInfo)}
			onmouseenter={() => (showInfo = true)}
			onmouseleave={() => (showInfo = false)}
		>i</button>
	</div>

	{#if !vector || totalDrawn === 0}
		<p class="empty">no records</p>
	{:else}
		<div
			class="plot"
			onpointermove={onMove}
			onpointerleave={() => (hover = null)}
		>
			<canvas bind:this={canvas} style="width:{size}px;height:{size}px"></canvas>
			{#each layout.axes as a (a.key)}
				<span class="axlbl" style="left:{a.x}px; top:{a.y}px">{a.label}</span>
			{/each}
		</div>

		<p class="type">{type.label}</p>

		{#if hover}
			<p class="read">
				<b>{hover.label}</b> · {fmtNum(hover.count)} · last {asDate(vector.lastActive[hover.key])}
			</p>
		{/if}
	{/if}

	{#if showInfo}
		<div class="pop" role="note">
			<p>A best-guess behavioural estimate from records this account emitted; reading and lurking leave no record and are not shown.</p>
			{#if vector && vector.unclassified > 0}
				<p>{fmtNum(vector.unclassified)} record{vector.unclassified === 1 ? '' : 's'} unclassified across {vector.unclassifiedCols.length} collection{vector.unclassifiedCols.length === 1 ? '' : 's'}.</p>
			{/if}
			<p class="cite">Modes after Forrester Social Technographics (Li &amp; Bernoff, 2008).</p>
		</div>
	{/if}
</section>

<style>
	.polar {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px 0;
		border-top: 1px solid var(--ink-soft);
	}
	.cap { display: flex; align-items: center; justify-content: space-between; }
	.lbl {
		font-family: 'Inter', sans-serif;
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--ink-soft);
	}
	.info {
		width: 16px; height: 16px;
		border: 1px solid var(--ink-soft);
		background: transparent;
		color: var(--ink-soft);
		font-family: 'JetBrains Mono', monospace;
		font-size: 10px;
		line-height: 1;
		cursor: help;
	}
	.plot { position: relative; align-self: center; }
	.axlbl {
		position: absolute;
		transform: translate(-50%, -50%);
		font-family: 'Inter', sans-serif;
		font-size: 8px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-soft);
		pointer-events: none;
		white-space: nowrap;
	}
	.type {
		margin: 0;
		text-align: center;
		font-family: 'JetBrains Mono', monospace;
		font-size: 15px;
		color: var(--ink);
	}
	.read, .empty {
		margin: 0;
		font-family: 'JetBrains Mono', monospace;
		font-size: 11px;
		color: var(--ink-soft);
		text-align: center;
	}
	.pop {
		border: 1px solid var(--ink-soft);
		padding: 8px;
		font-family: 'Inter', sans-serif;
		font-size: 10.5px;
		line-height: 1.5;
		color: var(--ink);
	}
	.pop p { margin: 0 0 6px; }
	.pop p:last-child { margin-bottom: 0; }
	.cite { color: var(--ink-soft); }
</style>
```

- [ ] **Step 2: Compute the vector in `+page.svelte`**

Find the line where hues are derived (`hues = collectionHues(d.records)` sets state, and near the top the `data` state is declared). Add an import and a derived value. Near the other `$lib/repo` imports:

```js
import { behaviorVector } from "$lib/repo/behavior.js";
```

Alongside the other `$derived` declarations (where `visible` / filters are derived from `data`):

```js
const behavior = $derived(data ? behaviorVector(data.records) : null);
```

- [ ] **Step 3: Pass it to `<Rail>`**

Find the `<Rail ... />` tag in `+page.svelte` and add the prop:

```svelte
	vector={behavior}
```

- [ ] **Step 4: Accept and mount it in `Rail.svelte`**

Add to the imports at the top of the `<script>`:

```js
	import PolarProfile from './PolarProfile.svelte';
```

Add `vector` to the `$props()` destructure (it currently includes `session`, `onsignin`, etc.):

```js
		vector = null,
```

Mount the panel immediately after the closing `</div>` of the Repository group (`<div class="grp"> … Repository … </div>`, which ends around line 158, before the `<details class="fold">` Preferences block):

```svelte
	{#if vector}
		<PolarProfile {vector} />
	{/if}
```

- [ ] **Step 5: Run the full test suite and the type check**

Run: `npm test`
Expected: PASS — all prior suites plus the three new ones (`behavior`, `polar`, `polarpaint`). The `style.spec.js` visual-language tests must stay green (the panel has no radius/shadow/gradient).

- [ ] **Step 6: Verify in the browser**

Start the dev server and load a real repo:

```bash
npm run dev
```

Then, via the preview tools: open `http://localhost:5173`, enter handle `pixeline.be` (a known-good 187k-record repo), run the read. Confirm:
- the **Behaviour** panel appears in the rail under the sign-in block;
- a seven-sided polygon draws, React clearly dominant (this repo is 93% likes), Create at the top;
- hovering a ray shows its count + last-active date;
- the ⓘ popover shows the best-guess note, an unclassified count, and the Forrester line;
- toggling the app's dark/light theme flips the chart's ink with it.

Capture a screenshot as proof. If the canvas is blank, check the browser console (a `getContext` or CSS-var read failing) before editing.

- [ ] **Step 7: Commit**

```bash
git add src/lib/components/PolarProfile.svelte src/lib/components/Rail.svelte src/routes/+page.svelte
git commit -m "feat(rail): behavioural polar profile panel under sign-in"
```

---

## Self-Review

**Spec coverage:**
- Section A (`behaviorVector`, classification, heuristic, unclassified, lastActive) → Task 1. ✓
- Derived type label (Section D) → Task 2. ✓
- Section B (`polarLayout`, fixed-log scale, angles, Create-at-top, rings) → Task 3. ✓
- Section C (hue = behaviour via golden angle, saturation = recency, neutral chrome, no circles) → Task 3 (hue/sat data) + Task 4 (neutral painter, heptagons, squares). ✓
- Section D (panel placement under sign-in, type label, hover counts, ⓘ popover with unclassified + best-guess + Forrester, edge cases) → Task 5. ✓
- Section E tests → Tasks 1–4 unit specs; the style test is the pre-existing `style.spec.js` that already scans the new `.svelte` file (noted in Global Constraints), so no new style test is added. ✓
- Out-of-scope (map, PNG export, follow actions) → correctly absent from all tasks. ✓

**Placeholder scan:** No TBD/TODO. Every code step is complete and runnable — Task 5's component is written once, in full.

**Type consistency:** `behaviorVector` keys (`RAY_ORDER`) are consumed unchanged by `polarLayout` (imports `RAY_ORDER`), `dominantType`, and the component's `totalDrawn`. `polarLayout` output fields (`center`, `radius`, `axes[].{angle,x,y,px,py,hue,sat}`, `rings[].r`, `polygon`) match exactly what `paintPolar` and `PolarProfile` read. `dominantType` returns `{ray,label}` as used. Colour triple `{ink,inkSoft,fill}` is identical in the painter, its test, and the component. Consistent.
