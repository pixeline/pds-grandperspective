# GrandPerspective — PDS edition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire the Stills & Frames stack viewer to an archive branch and rebuild the project as a treemap tool that reads any atproto repo in full and lets a signed-in user edit or delete records in their own.

**Architecture:** Pure data modules under `src/lib/repo/` and `src/lib/atproto/` emit plain arrays and maps with no DOM; Svelte components render them. The repo is read whole via `com.atproto.sync.getRepo` (a CAR file) with exhaustive `listRecords` as fallback. The treemap is drawn to a canvas because record counts reach ~187k. Writes go through atproto OAuth with a wildcard repo scope.

**Tech Stack:** SvelteKit 2 (runes mode, `adapter-static`, relative paths), Vitest, `@atproto/repo` 0.10.7, `@atproto/oauth-client-browser`. No server, no proxy, no credentials.

## Global Constraints

- **Never React. SvelteKit only.** Standing project preference.
- **All repo reading happens client-side.** No server, no proxy, no credentials at rest.
- **Every visual property traces to a real number in the repo.** No hash-seeded decoration.
- **Errors are reported, never decorated.** A clean repo reports zero errors; that is the honest output.
- **No rounded corners, no drop shadows, no gradients, no decorative motion.** Enforced by a test (Task 21).
- **Chroma belongs to the data alone.** Hue identifies a collection, saturation carries recency. All chrome is neutral.
- **Deployment URL is load-bearing:** `https://pixeline.be/pds-grandperspective/`. It contains the OAuth `client_id`.
- **OAuth scope, exact string:** `atproto repo:*?action=update&action=delete`
- **Footer credit, exact copy:** `Made by @pixeline.be · Treemap concept and name after GrandPerspective by Erwin Bonsma`
  - `@pixeline.be` → `https://bsky.app/profile/pixeline.be`
  - `GrandPerspective` → `https://grandperspectiv.sourceforge.net/` (note: no trailing `e` in the slug)
- **Verified `@atproto/repo` import:** `ReadableRepo` is NOT exported from the package index. Use `Repo`, which extends it and inherits the static `load`.
- **`getRepo` sends no `Content-Length`.** The body is chunked. Never write code that depends on it.
- **Test command:** `npm test` (runs `vitest --run`). Single file: `npx vitest run <path>`.
- **Commit trailer:** every commit ends with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

**Reference measurements** (from a live run against `pixeline.be`, used for sizing decisions and test fixtures):

| Measurement | Value |
|---|---|
| Records | 186,958 across 195 collections |
| CAR size / download | 65.7 MB in 6.5 s |
| MST walk | 4.0 s |
| Heap retained with values | 226 MB |
| `app.bsky.feed.like` | 174,041 records — 93% of records, 89% of stored bytes |
| Stored vs `JSON.stringify` length | 1.06×–1.14× depending on collection |

---

## File Structure

**Deleted**
- `src/lib/portrait/layout.js`, `src/lib/portrait/sessionize.js` — stack mapping
- `src/lib/components/Stack.svelte` — CSS-3D renderer
- `prototype/` — original single-file prototype

**Moved**
- `src/lib/portrait/` → `src/lib/repo/`
- `docs/brief.md`, `docs/mapping.md` → `docs/archive/`

**Created**

| File | Responsibility |
|---|---|
| `src/lib/repo/hues.js` | collection → hue and share. Extracted from `layout.js` before deletion. |
| `src/lib/repo/format.js` | `fmtNum`, `fmtBytes`, `fmtDur`, `fmtDate` |
| `src/lib/repo/urlstate.js` | hash round-trip for the new state shape |
| `src/lib/repo/filter.js` | collection / timeframe / query filtering |
| `src/lib/repo/hittest.js` | grid spatial index, pointer → record |
| `src/lib/atproto/car.js` | `getRepo` fetch + CAR parse, true stored byte sizes |
| `src/lib/atproto/session.svelte.js` | OAuth client, sign in/out, granted scopes |
| `src/lib/atproto/write.js` | `putRecord` / `deleteRecord` |
| `src/lib/components/Firehose.svelte` | the read, streaming |
| `src/lib/components/RecordModal.svelte` | inspect / edit / delete |
| `src/lib/components/Footer.svelte` | credits |
| `static/oauth-client-metadata.json` | OAuth client metadata; its URL is the `client_id` |

**Modified**
- `src/lib/atproto/read.js` — orchestrates CAR-first with fallback; no ceiling
- `src/lib/components/Treemap.svelte` — canvas renderer
- `src/lib/components/Rail.svelte` — filters and readouts, no sliders
- `src/routes/+page.svelte` — orchestration only
- `src/routes/+layout.svelte` — neutral palette, global reset

---

# Phase A — Archive and strip

## Task 1: Archive the stack, extract the hues, delete the stack

**Files:**
- Create: `src/lib/repo/hues.js`, `src/lib/repo/hues.spec.js`
- Delete: `src/lib/portrait/layout.js`, `src/lib/portrait/sessionize.js`, `src/lib/components/Stack.svelte`, `prototype/`
- Modify: `src/lib/portrait/portrait.spec.js`

**Interfaces:**
- Consumes: nothing
- Produces: `collectionHues(records) → { hueOf: Map<string,number>, shares: Map<string,number> }` where `records` is `Array<{col: string}>`. `hueOf` values are degrees `0..360`. `shares` values are counts, not fractions.

- [ ] **Step 1: Create the archive branch before deleting anything**

```bash
git branch archive/stills-and-frames
git branch --list 'archive/*'
```

Expected: `archive/stills-and-frames` listed. No remote is configured, so this is local-only — that is expected and accepted.

- [ ] **Step 2: Write the failing test for the extracted hues**

Create `src/lib/repo/hues.spec.js`:

```js
import { describe, it, expect } from 'vitest';
import { collectionHues } from './hues.js';

const recs = (...cols) => cols.map((col) => ({ col }));

describe('collectionHues', () => {
	it('counts records per collection', () => {
		const { shares } = collectionHues(recs('a.b.c', 'a.b.c', 'x.y.z'));
		expect(shares.get('a.b.c')).toBe(2);
		expect(shares.get('x.y.z')).toBe(1);
	});

	// the property that matters: a collection keeps its colour no matter what
	// order the reader happened to return records in
	it('assigns the same hue regardless of read order', () => {
		const forward = collectionHues(recs('a.b.c', 'm.n.o', 'x.y.z')).hueOf;
		const reverse = collectionHues(recs('x.y.z', 'm.n.o', 'a.b.c')).hueOf;
		expect(forward.get('m.n.o')).toBe(reverse.get('m.n.o'));
		expect(forward.get('a.b.c')).toBe(reverse.get('a.b.c'));
	});

	it('spreads hues by the golden angle over sorted nsids', () => {
		const { hueOf } = collectionHues(recs('a.b.c', 'm.n.o', 'x.y.z'));
		expect(hueOf.get('a.b.c')).toBeCloseTo(0, 5);
		expect(hueOf.get('m.n.o')).toBeCloseTo(137.507, 3);
		expect(hueOf.get('x.y.z')).toBeCloseTo(275.014, 3);
	});

	it('returns empty maps for an empty repo', () => {
		const { hueOf, shares } = collectionHues([]);
		expect(hueOf.size).toBe(0);
		expect(shares.size).toBe(0);
	});
});
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `npx vitest run src/lib/repo/hues.spec.js`
Expected: FAIL — `Failed to resolve import "./hues.js"`

- [ ] **Step 4: Write the implementation**

Create `src/lib/repo/hues.js`. The golden-angle walk over *sorted* NSIDs is what makes hues stable across reads — lifted verbatim from `layout.js` rather than reinvented:

```js
/**
 * Colour identity for collections.
 *
 * Extracted from the deleted `portrait/layout.js`. The walk runs over NSIDs
 * sorted alphabetically, which is what makes a collection's hue stable across
 * reads: the same repo always draws the same colours, whatever order the
 * reader returned records in. The golden angle spreads neighbouring
 * namespaces apart instead of letting them collide.
 *
 * @param {Array<{col: string}>} records
 * @returns {{hueOf: Map<string, number>, shares: Map<string, number>}}
 */
export function collectionHues(records) {
	const shares = new Map();
	for (const r of records) shares.set(r.col, (shares.get(r.col) || 0) + 1);

	const hueOf = new Map();
	[...shares.keys()].sort().forEach((c, i) => hueOf.set(c, (i * 137.507) % 360));

	return { hueOf, shares };
}
```

- [ ] **Step 5: Run the test and make sure it passes**

Run: `npx vitest run src/lib/repo/hues.spec.js`
Expected: PASS, 4 tests

- [ ] **Step 6: Delete the stack**

```bash
git rm -r prototype
git rm src/lib/portrait/layout.js src/lib/portrait/sessionize.js src/lib/components/Stack.svelte
```

- [ ] **Step 7: Strip stack assertions from the old spec file**

In `src/lib/portrait/portrait.spec.js`, delete the `sessionize` and `layout` imports and every `describe` block that exercises them. Keep the `tid`, `audit`, and `buildTreemap` blocks. The file is split properly in Task 2; this step only keeps the suite green.

Change the import block at the top from:

```js
import { sessionize } from './sessionize.js';
import { buildStack, globalLayout, partition } from './layout.js';
import { buildTreemap } from './treemap.js';
```

to:

```js
import { buildTreemap } from './treemap.js';
import { collectionHues } from '../repo/hues.js';
```

Then delete the `describe('sessionize', …)`, `describe('partition', …)` and `describe('buildStack', …)` blocks.

**The surviving `buildTreemap` block still calls `globalLayout`** — near the top of that describe, `const g = globalLayout(records);`. That function is being deleted, so replace that one line with:

```js
	const g = collectionHues(records);
```

This is a true drop-in: the block only ever reads `g.hueOf`, and `collectionHues` returns the same `hueOf` map built by the same sorted golden-angle walk. Without this change the suite fails at Step 8 with `globalLayout is not defined`.

- [ ] **Step 8: Run the whole suite**

Run: `npm test`
Expected: PASS. `src/routes/+page.svelte` still imports the deleted modules and will fail `npm run check`, but the test suite does not typecheck Svelte files — that import is fixed in Task 3.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor: archive the stack, extract collection hues

The stack viewer moves to archive/stills-and-frames. Before deleting
layout.js, lift out the golden-angle hue walk the treemap depends on --
sorted-nsid ordering is what keeps a collection's colour stable across
reads, so it is preserved verbatim rather than reinvented.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Rename `portrait/` to `repo/`, split `params.js`

**Files:**
- Move: `src/lib/portrait/treemap.js` → `src/lib/repo/treemap.js`
- Create: `src/lib/repo/format.js`, `src/lib/repo/treemap.spec.js`, `src/lib/atproto/tid.spec.js`, `src/lib/atproto/audit.spec.js`
- Delete: `src/lib/portrait/params.js`, `src/lib/portrait/portrait.spec.js`

**Interfaces:**
- Consumes: `collectionHues` from Task 1
- Produces: `fmtNum(n) → string`, `fmtBytes(b) → string`, `fmtDur(ms) → string`, `fmtDate(ms) → string`, all from `$lib/repo/format.js`. `buildTreemap` keeps its existing signature at its new path.

- [ ] **Step 1: Move the surviving modules**

```bash
git mv src/lib/portrait/treemap.js src/lib/repo/treemap.js
```

- [ ] **Step 2: Create `format.js` with only the formatters that survive**

Create `src/lib/repo/format.js`. This is `params.js` minus the `PARAMS` array and minus the hash functions (which move to `urlstate.js` in Task 11):

```js
/** @param {number} n */
export function fmtNum(n) {
	return n >= 1e4 ? `${(n / 1e3).toFixed(1)}k` : String(n);
}

/** @param {number} b */
export function fmtBytes(b) {
	if (b < 1024) return `${b} B`;
	if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
	return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

/** @param {number} ms */
export function fmtDur(ms) {
	const m = ms / 6e4;
	if (m < 1) return '<1 min';
	if (m < 90) return `${Math.round(m)} min`;
	const h = m / 60;
	if (h < 36) return `${h.toFixed(1)} h`;
	return `${(h / 24).toFixed(1)} d`;
}

/** @param {number} ms */
export function fmtDate(ms) {
	return new Date(ms).toISOString().replace('T', ' ').slice(0, 16);
}
```

- [ ] **Step 3: Split the spec file — write the three new test files**

Create `src/lib/atproto/tid.spec.js`:

```js
import { describe, it, expect } from 'vitest';
import { tidToMs, recordTime } from './tid.js';

const NOW = Date.parse('2026-07-30T00:00:00Z');

describe('tid', () => {
	it('decodes a real TID to a plausible time', () => {
		const ms = tidToMs('3lkwkzb3az22s', NOW);
		expect(ms).toBeGreaterThan(Date.parse('2025-01-01'));
		expect(ms).toBeLessThan(NOW);
	});

	it('rejects non-TID keys rather than inventing a time', () => {
		expect(tidToMs('self', NOW)).toBeNull();
		expect(tidToMs('!!!!!!!!!!!!!', NOW)).toBeNull();
		expect(tidToMs('', NOW)).toBeNull();
	});

	// the TID is server-assigned, createdAt is user-claimed, so TID wins
	it('prefers the TID over a claimed createdAt', () => {
		const r = recordTime('3lkwkzb3az22s', { createdAt: '2020-01-01T00:00:00Z' }, NOW);
		expect(r.source).toBe('tid');
		expect(r.ts).toBeGreaterThan(Date.parse('2025-01-01'));
	});

	it('falls back to createdAt when the rkey is not a TID', () => {
		const r = recordTime('self', { createdAt: '2020-01-01T00:00:00Z' }, NOW);
		expect(r.source).toBe('createdAt');
		expect(r.ts).toBe(Date.parse('2020-01-01T00:00:00Z'));
		expect(r.tid).toBeNull();
	});

	it('reports no timestamp rather than guessing one', () => {
		const r = recordTime('self', { nothing: true }, NOW);
		expect(r.ts).toBeNull();
		expect(r.source).toBeNull();
	});
});
```

Create `src/lib/atproto/audit.spec.js`:

```js
import { describe, it, expect } from 'vitest';
import { audit } from './audit.js';

const NOW = Date.parse('2026-07-30T00:00:00Z');

describe('audit', () => {
	// the bug this encodes: Bluesky's schema was applied to lexicons that never
	// agreed to it, reporting 304 errors where 64 were real
	it('does not require createdAt outside app.bsky', () => {
		const rec = { note: { createdAt: '2025-03-22T01:25:18.509Z' } };
		expect(audit('my.skylights.rel', '3lkwkzb3az22s', rec, null, NOW)).toEqual([]);
	});

	it('does not apply the 300-grapheme limit outside app.bsky.feed.post', () => {
		const long = { text: 'x'.repeat(5000), createdAt: '2026-01-01T00:00:00Z' };
		expect(audit('site.standard.document', 'abc', long, null, NOW)).toEqual([]);
		expect(audit('app.bsky.feed.post', 'abc', long, null, NOW)).toContain(
			'text over 300 graphemes'
		);
	});

	it('still flags genuinely universal breakage', () => {
		expect(audit('any.lexicon.thing', 'k', { $type: 'other.thing' }, null, NOW)).toContain(
			'$type ≠ collection'
		);
	});

	it('reports a clean record as clean', () => {
		const clean = { $type: 'app.bsky.feed.post', text: 'hello', createdAt: '2026-01-01T00:00:00Z' };
		expect(audit('app.bsky.feed.post', '3lkwkzb3az22s', clean, null, NOW)).toEqual([]);
	});
});
```

Create `src/lib/repo/treemap.spec.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildTreemap } from './treemap.js';
import { collectionHues } from './hues.js';

function repo(spec) {
	const out = [];
	let t = Date.parse('2026-01-01T00:00:00Z');
	for (const [col, n] of Object.entries(spec)) {
		for (let i = 0; i < n; i++) {
			out.push({ col, ts: (t += 1000), rkey: `${col}-${i}`, bytes: 100, errs: 0, errNames: [] });
		}
	}
	return out;
}

describe('buildTreemap', () => {
	it('gives a collection area in proportion to its weight', () => {
		const records = repo({ 'a.b.big': 900, 'a.b.small': 100 });
		const { hueOf } = collectionHues(records);
		const { blocks } = buildTreemap(records, { w: 1000, h: 1000, weigh: 'records', hueOf });
		const big = blocks.find((b) => b.nsid === 'a.b.big');
		const small = blocks.find((b) => b.nsid === 'a.b.small');
		expect(big.w * big.h).toBeGreaterThan(small.w * small.h * 5);
	});

	it('flags blocks too small to resolve rather than faking one cell per record', () => {
		const records = repo({ 'a.b.c': 20000 });
		const { hueOf } = collectionHues(records);
		const { blocks, aggregated } = buildTreemap(records, { w: 60, h: 60, weigh: 'records', hueOf });
		expect(aggregated).toBeGreaterThan(0);
		expect(blocks.some((b) => b.aggregate)).toBe(true);
	});

	it('emits one cell per record when there is room', () => {
		const records = repo({ 'a.b.c': 4 });
		const { hueOf } = collectionHues(records);
		const { cells } = buildTreemap(records, { w: 400, h: 400, weigh: 'records', hueOf });
		expect(cells).toBe(4);
	});

	it('draws nothing for an empty repo instead of throwing', () => {
		const { hueOf } = collectionHues([]);
		const { blocks, cells } = buildTreemap([], { w: 400, h: 400, weigh: 'bytes', hueOf });
		expect(blocks).toEqual([]);
		expect(cells).toBe(0);
	});
});
```

- [ ] **Step 4: Delete the old files**

```bash
git rm src/lib/portrait/params.js src/lib/portrait/portrait.spec.js
```

- [ ] **Step 5: Run the suite**

Run: `npm test`
Expected: FAIL — `src/lib/components/Treemap.svelte`, `Rail.svelte`, `Tip.svelte` and `src/routes/+page.svelte` still import `$lib/portrait/…`. Note which files the errors name; fix them in Step 6.

- [ ] **Step 6: Repoint every import**

```bash
grep -rln '\$lib/portrait' src/
```

In each file listed, rewrite imports:
- `$lib/portrait/treemap.js` → `$lib/repo/treemap.js`
- `$lib/portrait/params.js` → `$lib/repo/format.js` (for `fmtBytes`, `fmtNum`, `fmtDur`, `fmtDate`)

`src/routes/+page.svelte` also imports `buildStack`, `globalLayout`, `medianSession` from the deleted `layout.js` and `suggestGapMinutes` from the deleted `sessionize.js`, and `defaults`/`fromHash`/`toHash` from `params.js`. Leave `+page.svelte` broken for now — Task 3 rewrites it wholesale. To keep the suite runnable, only fix the three component files.

- [ ] **Step 7: Run the suite again**

Run: `npm test`
Expected: PASS — 13 tests across `hues.spec.js`, `tid.spec.js`, `audit.spec.js`, `treemap.spec.js`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor: rename portrait/ to repo/, split params.js

"Portrait" no longer describes the contents. params.js splits into
format.js (the formatters, all still used); its PARAMS array is deleted
outright since five entries were stack parameters and the sixth, the
record ceiling, is removed by the new read path.

The single portrait.spec.js becomes one spec file per module.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Move the docs, rewrite CLAUDE.md and README

**Files:**
- Move: `docs/brief.md`, `docs/mapping.md` → `docs/archive/`
- Modify: `CLAUDE.md`
- Create: `README.md`

**Interfaces:**
- Consumes: nothing
- Produces: nothing consumed by code

- [ ] **Step 1: Archive the stack documentation**

```bash
mkdir -p docs/archive
git mv docs/brief.md docs/archive/brief.md
git mv docs/mapping.md docs/archive/mapping.md
```

They describe the stack, but they also record the reasoning behind decisions still live in `read.js` and `audit.js` — deleting them would lose that.

- [ ] **Step 2: Add a note at the top of each archived file**

Prepend to both `docs/archive/brief.md` and `docs/archive/mapping.md`:

```markdown
> **Archived.** This documents the retired *Stills & Frames* stack viewer, kept
> because it records the reasoning behind the fair-reading and scoped-auditing
> decisions that are still live. The code it describes is on the
> `archive/stills-and-frames` branch. The current design is in
> `docs/superpowers/specs/2026-08-02-grandperspective-pds-edition-design.md`.
```

- [ ] **Step 3: Rewrite `CLAUDE.md`**

Replace the entire file with:

```markdown
# atproto-avatar — "GrandPerspective, PDS edition"

A browser tool that draws any atproto repo as a treemap sized by stored bytes,
and lets a signed-in user edit or delete records in their own repo. Reads work
for anyone, unauthenticated; writes require atproto OAuth.

Design spec: `docs/superpowers/specs/2026-08-02-grandperspective-pds-edition-design.md`

**Status:** SvelteKit app in `src/`. Verified against `pixeline.be` — 186,958
records across 195 collections, PDS `eurosky.social`. The retired *Stills &
Frames* stack viewer lives on the `archive/stills-and-frames` branch.

## Hard constraints

1. **Never React. Use SvelteKit.** Applies to this and every project.
2. **All repo reading happens client-side.** No server, no proxy, no credentials.
   Browser CORS rules are therefore a real constraint.
3. **Every visual property traces to a number in the repo.** If you cannot name
   the source of a mark, do not draw it.
4. **Errors are reported, never decorated.** A clean repo reports zero errors,
   and that is the honest output.
5. **No rounded corners, no drop shadows, no gradients, no decorative motion.**
   International Style applied to data. Enforced by a test.
6. **Chroma belongs to the data.** Hue identifies a collection, saturation
   carries recency. All chrome is neutral.

## Layout

    src/lib/atproto/tid.js        TID → ms (server clock, preferred over createdAt)
    src/lib/atproto/identity.js   handle → DID → PDS endpoint
    src/lib/atproto/car.js        getRepo CAR fetch + parse, true stored byte sizes
    src/lib/atproto/read.js       orchestrates CAR-first with listRecords fallback
    src/lib/atproto/audit.js      error taxonomy, scoped per lexicon
    src/lib/atproto/session.svelte.js    OAuth client, sign in/out, granted scopes
    src/lib/atproto/write.js      putRecord / deleteRecord
    src/lib/atproto/typeahead.js  actor search (typeahead.waow.tech)
    src/lib/repo/hues.js          collection → hue and share
    src/lib/repo/treemap.js       nsid nesting + squarified layout
    src/lib/repo/filter.js        collection / timeframe / query filtering
    src/lib/repo/hittest.js       grid spatial index, pointer → record
    src/lib/repo/format.js        formatters
    src/lib/repo/urlstate.js      hash round-trip
    src/lib/components/           Rail, Treemap, Firehose, RecordModal, Footer, …
    src/routes/+page.svelte       orchestration only

`npm run dev` · `npm test` · `npm run build`

**The seam that matters:** `treemap.js`, `filter.js`, `hittest.js` and `hues.js`
emit plain data — no DOM, no CSS. Components render that. It is what made
swapping the DOM renderer for canvas a leaf change, and what would make a
later swap to WebGL the same.

## Findings that are load-bearing

- **Read the whole repo or the treemap lies.** The old reader sampled ~21
  records per collection under a 4000-record ceiling — 2.1% of a 186,958-record
  repo. `app.bsky.feed.like` is 93% of that repo's records and 89% of its bytes,
  and was drawn from 21 of them. A treemap's only claim is that area is
  proportional to size; equalized sampling breaks exactly that claim. Never
  reintroduce a ceiling.
- **The fair round-robin read is retired, deliberately.** It existed to make
  every collection *present* under truncation. With no truncation there is
  nothing to mitigate. Do not restore it as a lost improvement.
- **`ReadableRepo` is not exported from `@atproto/repo`.** Use `Repo`, which
  extends it and inherits the static `load`.
- **`getRepo` sends no `Content-Length`** — the body is chunked. Size must be
  counted while streaming, never read ahead.
- **Audit only what a lexicon actually promises.** All 304 "invalid records" on
  pixeline.be were non-Bluesky lexicons judged by `app.bsky`'s schema. Scoping
  the rules dropped it to 64 real errors.
- **`window.open` with a features string is a popup**, and blockers kill it
  silently. Use a synthetic `<a target="_blank">`.
- **Canvas hit testing is ours now.** A bug in `hittest.js` opens the wrong
  record — and that modal has a delete button.

## Known risks

- **CORS.** Self-hosted PDSs may not send `Access-Control-Allow-Origin` on
  `/xrpc/`. `eurosky.social` does send `*`, so the motivating case works. Prefer
  failing loudly over falling back to an AppView, which would lose the
  unknown-lexicon coverage that motivates the tool.
- **Memory.** 226 MB heap for a 187k-record repo with values retained. Gated by
  a streaming size check at 150 MB of CAR, not by silent truncation.
- **`did:web` resolution** is written but untested.
- **Deployment path is permanent.** The OAuth `client_id` is a URL.
```

- [ ] **Step 4: Create `README.md`**

```markdown
# GrandPerspective — PDS edition

See where an atproto repo's bytes actually go, then act on what you find.

Enter any handle or DID and the tool reads that repo in full, straight from its
PDS in your browser, and draws it as a treemap: one cell per record, area
proportional to the bytes it actually occupies. Sign in with your own atproto
account and you can edit or delete your own records.

Everything runs client-side. There is no server, no proxy, and no credential
ever leaves your browser — public repo reads need no authentication at all, and
writes use atproto OAuth.

## Development

    npm install
    npm run dev      # binds 127.0.0.1 — required for the OAuth loopback client
    npm test
    npm run build

## Credits

Made by [@pixeline.be](https://bsky.app/profile/pixeline.be).

The treemap concept and the name come from
[**GrandPerspective**](https://grandperspectiv.sourceforge.net/) by Erwin
Bonsma — a disk usage visualiser for macOS, released under the GPL. This project
is an independent work applying the same idea to atproto repositories. It is not
a port of GrandPerspective and is not affiliated with it.
```

- [ ] **Step 5: Verify the archived docs are reachable and the links resolve**

```bash
ls docs/archive/ && head -6 docs/archive/brief.md && grep -c "grandperspectiv.sourceforge.net" README.md
```

Expected: both files listed, the archive note at the top of `brief.md`, and `1` for the credit link.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
docs: reorient CLAUDE.md and add a README

Archives the stack brief and mapping rather than deleting them -- they
record the reasoning behind the scoped-auditing decision that is still
live. CLAUDE.md now describes the treemap tool and carries the findings
that would otherwise be relearned the hard way.

README credits GrandPerspective by Erwin Bonsma as the source of the
name and the idea, and states this is independent rather than a port.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

# Phase B — Read the whole repo

## Task 4: CAR fetch and parse

**Files:**
- Create: `src/lib/atproto/car.js`, `src/lib/atproto/car.spec.js`

**Interfaces:**
- Consumes: `recordTime` from `$lib/atproto/tid.js`, `audit` from `$lib/atproto/audit.js`
- Produces:
  - `carUrl(pds, did) → string`
  - `parseRepoCar(bytes, opts?) → Promise<{did, rev, records, collections}>` where each record is `{col, ts, rkey, bytes, exact: true, errs, errNames, value}` and `collections` is a sorted `string[]`. `opts.now` is an injectable clock for tests.
  - `fetchCarBytes(url, {signal, onProgress, limitBytes}) → Promise<Uint8Array>` — streams and counts; calls `onProgress(bytesSoFar)`; throws `Error('size-limit')` when `limitBytes` is exceeded.

- [ ] **Step 1: Write the failing test**

Create `src/lib/atproto/car.spec.js`. The fixture is built with the same library that reads it, so the test exercises the real CAR format rather than a mock:

```js
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
```

- [ ] **Step 2: Add the crypto dev dependency the fixture needs**

```bash
npm install --save-dev @atproto/crypto
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/lib/atproto/car.spec.js`
Expected: FAIL — `Failed to resolve import "./car.js"`

- [ ] **Step 4: Write the implementation**

Create `src/lib/atproto/car.js`:

```js
import { readCarWithRoot, MemoryBlockstore, Repo } from '@atproto/repo';
import { recordTime } from './tid.js';
import { audit } from './audit.js';

/**
 * `com.atproto.sync.getRepo` returns the complete repo -- every record, the MST
 * nodes, and the signed commit -- in one CAR file. It is deliberately
 * unauthenticated: repo content is public.
 *
 * @param {string} pds
 * @param {string} did
 */
export function carUrl(pds, did) {
	return `${pds}/xrpc/com.atproto.sync.getRepo?did=${encodeURIComponent(did)}`;
}

/**
 * Stream the CAR body, counting as it goes.
 *
 * getRepo responds with no Content-Length -- the body is chunked -- so the size
 * cannot be known before the download starts. Counting while streaming is the
 * only way to gate it, and it doubles as the progress signal the firehose shows.
 *
 * @param {string} url
 * @param {{signal?: AbortSignal, onProgress?: (bytes: number) => void,
 *          limitBytes?: number, onSizeGate?: (bytes: number) => Promise<boolean>,
 *          fetchImpl?: typeof fetch}} [opts]
 * @returns {Promise<Uint8Array>}
 */
export async function fetchCarBytes(url, opts = {}) {
	const { signal, onProgress, limitBytes = Infinity, onSizeGate, fetchImpl = fetch } = opts;

	const res = await fetchImpl(url, { signal });
	if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`);
	if (!res.body) throw new Error('response has no body to stream');

	const reader = res.body.getReader();
	const chunks = [];
	let total = 0;
	let limit = limitBytes;

	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
		total += value.length;
		onProgress?.(total);

		if (total > limit) {
			// ask, and honour the answer. Without a gate callback the limit is a
			// hard stop; with one, agreeing lifts it for the rest of this read.
			const proceed = onSizeGate ? await onSizeGate(total) : false;
			if (!proceed) {
				await reader.cancel();
				throw new Error('size-limit');
			}
			limit = Infinity;
		}
	}

	const out = new Uint8Array(total);
	let at = 0;
	for (const c of chunks) {
		out.set(c, at);
		at += c.length;
	}
	return out;
}

/**
 * Parse a repo CAR into the flat record array the rest of the app works in.
 *
 * `ReadableRepo` is not re-exported from @atproto/repo; `Repo` extends it and
 * inherits the static `load`. Each record's stored size is the length of its
 * DAG-CBOR block -- what the PDS actually holds -- rather than a re-serialised
 * JSON estimate.
 *
 * @param {Uint8Array} bytes
 * @param {{now?: number, onRecord?: (r: any, n: number) => void}} [opts]
 */
export async function parseRepoCar(bytes, opts = {}) {
	const { now = Date.now(), onRecord } = opts;

	const { root, blocks } = await readCarWithRoot(bytes);
	const repo = await Repo.load(new MemoryBlockstore(blocks), root);

	const records = [];
	const collections = new Set();

	for await (const { collection, rkey, cid, record } of repo.walkRecords()) {
		// Keep records whose time cannot be decoded. On the live test repo that
		// is 25 records across 25 distinct collections, one each -- singleton
		// `self`-keyed config records. They occupy bytes, and dropping them
		// would erase those collections from a map that measures disk usage.
		const { ts, tid } = recordTime(rkey, record, now);
		const errNames = audit(collection, rkey, record, tid, now);
		const out = {
			col: collection,
			ts,
			rkey,
			bytes: blocks.get(cid)?.length ?? 0,
			exact: true,
			errs: errNames.length,
			errNames,
			value: record
		};
		records.push(out);
		collections.add(collection);
		onRecord?.(out, records.length);
	}

	// Undated records sort LAST. `a.ts - b.ts` coerces null to 0 and would claim
	// they are the oldest records in the repo, a fact nobody has. Nothing
	// downstream may derive the repo's time span from array position -- see the
	// note below.
	records.sort((a, b) => (a.ts ?? Infinity) - (b.ts ?? Infinity));
	return { did: repo.did, rev: repo.commit.rev, records, collections: [...collections].sort() };
}
```

**`treemap.js` must not read the time span off array ends.** It previously did
(`records[0].ts`, `records[records.length - 1].ts`), which with a single undated
record inflated the span roughly fifteen-fold and silently flattened the recency
gradient across the entire map — no crash, no `NaN`, no failing test. Compute
`newest`/`oldest` by scanning for records that actually carry a timestamp, and
give undated cells one fixed colour off the recency ramp plus an `undated: true`
flag. Never invent a fallback timestamp.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/atproto/car.spec.js`
Expected: PASS, 12 tests

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(atproto): read a whole repo from its CAR export

com.atproto.sync.getRepo returns every record in one unauthenticated
request, and each record's DAG-CBOR block length is what the PDS
actually stores -- a measurement rather than the JSON re-serialisation
the old reader estimated with.

The body arrives chunked with no Content-Length, so fetchCarBytes
streams and counts, which both gates size and feeds the progress
display.

Tests build fixtures with the same library that reads them, so they
exercise the real CAR format rather than a mock of it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Exhaustive `listRecords` fallback

**Files:**
- Create: `src/lib/atproto/list.js`, `src/lib/atproto/list.spec.js`

**Interfaces:**
- Consumes: `jget` from `$lib/atproto/identity.js`, `recordTime`, `audit`
- Produces: `listAllRecords(pds, did, {signal, onProgress, fetchImpl}) → Promise<{records, collections}>` — records shaped as in Task 4 but with `exact: false` and `bytes` from `JSON.stringify(value).length`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/atproto/list.spec.js`:

```js
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

	it('refuses an empty repo loudly', async () => {
		const fetchImpl = fakePds({ collections: [], pages: {} });
		await expect(
			listAllRecords('https://pds.test', DID, { fetchImpl, now: NOW })
		).rejects.toThrow('no collections');
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/atproto/list.spec.js`
Expected: FAIL — `Failed to resolve import "./list.js"`

- [ ] **Step 3: Write the implementation**

Create `src/lib/atproto/list.js`:

```js
import { recordTime } from './tid.js';
import { audit } from './audit.js';

/** A collection cannot page forever; this bounds a pathological server. */
const MAX_PAGES_PER_COLLECTION = 4000;

/**
 * Fallback reader: describeRepo, then listRecords paged to exhaustion on every
 * collection.
 *
 * Used only when the CAR endpoint is unavailable. Read ORDER does not matter
 * here -- every collection is read completely either way -- which is why the
 * old fair round-robin is gone rather than merely unused. It existed to make
 * every collection present under a record ceiling, and there is no ceiling.
 *
 * Byte sizes on this path are JSON re-serialisation lengths, which run
 * 1.06x-1.14x larger than what the PDS stores and vary by collection. They are
 * therefore marked `exact: false` so the UI can say so.
 *
 * @param {string} pds
 * @param {string} did
 * @param {{signal?: AbortSignal, onProgress?: (msg: string, n: number) => void,
 *          now?: number, fetchImpl?: typeof fetch}} [opts]
 */
export async function listAllRecords(pds, did, opts = {}) {
	const { signal, onProgress, now = Date.now(), fetchImpl = fetch } = opts;

	const get = async (url) => {
		const r = await fetchImpl(url, { signal });
		if (!r.ok) throw new Error(`${r.status} from ${new URL(url).host}`);
		return r.json();
	};

	const desc = await get(
		`${pds}/xrpc/com.atproto.repo.describeRepo?repo=${encodeURIComponent(did)}`
	);
	const collections = (desc.collections || []).slice().sort();
	if (!collections.length) throw new Error('Repo is empty — no collections to read.');

	const records = [];

	for (const col of collections) {
		let cursor = null;
		for (let page = 0; page < MAX_PAGES_PER_COLLECTION; page++) {
			const url =
				`${pds}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(did)}` +
				`&collection=${encodeURIComponent(col)}&limit=100` +
				(cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
			const j = await get(url);

			for (const r of j.records || []) {
				const rkey = String(r.uri).split('/').pop();
				// keep records whose time cannot be decoded -- they still occupy
				// bytes, and on a real repo they are ~25 singleton `self`-keyed
				// config records spread one per collection. Dropping them would
				// erase those collections from a map that measures disk usage.
				const { ts, tid } = recordTime(rkey, r.value, now);
				const errNames = audit(col, rkey, r.value, tid, now);
				records.push({
					col,
					ts,
					rkey,
					bytes: JSON.stringify(r.value ?? null).length,
					exact: false,
					errs: errNames.length,
					errNames,
					value: r.value
				});
			}

			onProgress?.(`${records.length} records · ${col.split('.').pop()}`, records.length);
			cursor = j.cursor || null;
			if (!cursor) break;
		}
	}

	// undated records sort last. `a.ts - b.ts` would coerce null to 0 and claim
	// they are the oldest things in the repo, which is a fact we do not have.
	records.sort((a, b) => (a.ts ?? Infinity) - (b.ts ?? Infinity));
	return { records, collections };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/atproto/list.spec.js`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(atproto): exhaustive listRecords fallback, no ceiling

Every collection paged to exhaustion for when the CAR endpoint is
unavailable. Read order no longer matters, so the fair round-robin is
gone rather than merely unused -- it existed to make collections present
under a ceiling that no longer exists.

Sizes here are JSON lengths, 1.06x-1.14x larger than stored and varying
by collection, so records are marked exact: false and the UI says so.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Orchestrate the read

**Files:**
- Modify: `src/lib/atproto/read.js` (replace entirely)
- Create: `src/lib/atproto/read.spec.js`

**Interfaces:**
- Consumes: `resolveIdentity` from `identity.js`, `carUrl`/`fetchCarBytes`/`parseRepoCar` from `car.js`, `listAllRecords` from `list.js`
- Produces: `readRepo(input, {signal, onProgress, onSizeGate, limitBytes, now, fetchImpl}) → Promise<{did, pds, rev, records, collections, exact, errorTally, source}>` where `source` is `'car' | 'list'` and `exact` is `true` only on the CAR path. `onProgress(event)` receives `{phase, bytes?, records?, message}` with `phase` in `'resolving' | 'receiving' | 'parsing' | 'listing'`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/atproto/read.spec.js`:

```js
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

	it('surfaces a failed identity resolution', async () => {
		const fetchImpl = async () => new Response('no', { status: 400 });
		await expect(readRepo('nope.test', { fetchImpl, now: NOW })).rejects.toThrow();
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/atproto/read.spec.js`
Expected: FAIL — the current `readRepo` has signature `(input, cap, signal, onProgress)` and knows nothing about CAR, so several tests error.

- [ ] **Step 3: Make `identity.js` injectable and https-strict**

Modify `src/lib/atproto/identity.js`. Add a `fetchImpl` option so the read path can be tested without network, and require `https` on a resolved PDS endpoint — discovery documents are untrusted third-party input:

```js
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
 * @returns {Promise<{did: string, pds: string}>}
 */
export async function resolveIdentity(input, opts = {}) {
	let did = input.trim().replace(/^@/, '');
	if (!did.startsWith('did:')) {
		const j = await jget(
			`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(did)}`,
			opts
		);
		did = j.did;
	}
	const doc = await fetchDidDoc(did, opts);
	const svc = (doc.service || []).find((/** @type {any} */ s) =>
		String(s.id).endsWith('atproto_pds')
	);
	if (!svc) throw new Error('DID document lists no PDS service');

	const pds = String(svc.serviceEndpoint).replace(/\/$/, '');
	// the DID document is untrusted third-party input; only https is acceptable
	if (!pds.startsWith('https://')) throw new Error(`PDS endpoint is not https: ${pds}`);

	return { did, pds };
}
```

- [ ] **Step 4: Replace `read.js`**

Replace `src/lib/atproto/read.js` entirely:

```js
import { resolveIdentity } from './identity.js';
import { carUrl, fetchCarBytes, parseRepoCar } from './car.js';
import { listAllRecords } from './list.js';

/**
 * Above this many CAR bytes, stop and ask. Calibrated against a real repo:
 * pixeline.be holds 186,958 records in a 65.7 MB CAR, so ordinary accounts
 * never see the prompt.
 */
export const DEFAULT_LIMIT_BYTES = 150 * 1024 * 1024;

/**
 * Read a repo in full.
 *
 * CAR first: one unauthenticated request returns every record, and each
 * record's stored size is a measurement rather than an estimate. Exhaustive
 * listRecords is the fallback for a PDS that blocks or CORS-restricts the sync
 * endpoint -- it works, but its sizes are JSON lengths, so `exact` is false and
 * the UI says so.
 *
 * There is NO record ceiling. The previous reader sampled ~21 records per
 * collection, which drew a 186,958-record repo from 4,000 records and rendered
 * a collection holding 93% of the repo as a sliver. A treemap's only claim is
 * that area is proportional to size.
 *
 * @param {string} input handle or DID
 * @param {{signal?: AbortSignal,
 *          onProgress?: (e: {phase: string, bytes?: number, records?: number, message: string}) => void,
 *          onSizeGate?: (bytes: number) => Promise<boolean>,
 *          limitBytes?: number, now?: number, fetchImpl?: typeof fetch}} [opts]
 */
export async function readRepo(input, opts = {}) {
	const {
		signal,
		onProgress,
		onSizeGate,
		limitBytes = DEFAULT_LIMIT_BYTES,
		now = Date.now(),
		fetchImpl = fetch
	} = opts;

	const say = (phase, message, extra = {}) => onProgress?.({ phase, message, ...extra });

	say('resolving', 'Resolving identity…');
	const { did, pds } = await resolveIdentity(input, { signal, fetchImpl });

	let out = null;
	let source = 'car';

	try {
		say('receiving', `Reading ${new URL(pds).host}…`, { bytes: 0 });

		const bytes = await fetchCarBytes(carUrl(pds, did), {
			signal,
			limitBytes,
			onSizeGate,
			fetchImpl,
			onProgress: (n) => say('receiving', `${(n / 1048576).toFixed(1)} MB`, { bytes: n })
		});

		say('parsing', 'Parsing repository…', { bytes: bytes.length });
		out = await parseRepoCar(bytes, {
			now,
			onRecord: (_r, n) => {
				if (n % 500 === 0) say('parsing', `${n} records`, { records: n });
			}
		});
	} catch (err) {
		// the size gate is the user's decision, not a failure to route around
		if (String(err?.message) === 'size-limit') throw err;
		if (signal?.aborted) throw err;

		source = 'list';
		say('listing', `CAR unavailable (${err?.message ?? err}) — reading collection by collection…`);
		out = await listAllRecords(pds, did, {
			signal,
			now,
			fetchImpl,
			onProgress: (message, records) => say('listing', message, { records })
		});
	}

	const errorTally = new Map();
	for (const r of out.records) {
		for (const e of r.errNames) errorTally.set(e, (errorTally.get(e) || 0) + 1);
	}

	return {
		did: out.did ?? did,
		pds,
		rev: out.rev ?? null,
		records: out.records,
		collections: out.collections,
		exact: source === 'car',
		errorTally,
		source
	};
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/atproto/read.spec.js`
Expected: PASS, 5 tests

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS. `+page.svelte` is still broken; Task 18 rewrites it.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(atproto): orchestrate a whole-repo read, CAR first

readRepo resolves identity, tries the CAR export, and falls back to
exhaustive listRecords with the reason reported rather than swallowed.
The size gate at 150 MB is a user decision, so it propagates instead of
being routed around by the fallback.

identity.js gains an injectable fetch and now rejects a non-https PDS
endpoint -- DID documents are untrusted third-party input.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

# Phase C — Filter, hit-test, render

## Task 7: Filters and search

**Files:**
- Create: `src/lib/repo/filter.js`, `src/lib/repo/filter.spec.js`

**Interfaces:**
- Consumes: nothing
- Produces: `applyFilters(records, {collections, from, to, query}) → {records, matched, total, bytes, totalBytes}`. `collections` is a `Set<string>` of NSIDs or dot-segment prefixes; empty means no filter. `from`/`to` are inclusive ms bounds or null. `query` is a case-insensitive substring; empty/whitespace means no filter.

- [ ] **Step 1: Write the failing test**

Create `src/lib/repo/filter.spec.js`:

```js
import { describe, it, expect } from 'vitest';
import { applyFilters } from './filter.js';

const T = (iso) => Date.parse(iso);

const RECORDS = [
	{ col: 'app.bsky.feed.post', rkey: 'aaa', ts: T('2025-01-01'), bytes: 10, value: { text: 'hello world' } },
	{ col: 'app.bsky.feed.like', rkey: 'bbb', ts: T('2025-06-01'), bytes: 20, value: { subject: { uri: 'at://x' } } },
	{ col: 'app.bskyfoo.thing', rkey: 'ccc', ts: T('2026-01-01'), bytes: 30, value: { note: 'unrelated' } },
	{ col: 'my.custom.rel', rkey: 'ddd', ts: T('2026-06-01'), bytes: 40, value: { nested: { deep: 'needle' } } }
];

const none = { collections: new Set(), from: null, to: null, query: '' };

describe('applyFilters', () => {
	it('passes everything through when nothing is set', () => {
		const out = applyFilters(RECORDS, none);
		expect(out.matched).toBe(4);
		expect(out.total).toBe(4);
		expect(out.bytes).toBe(100);
		expect(out.totalBytes).toBe(100);
	});

	it('matches an exact collection', () => {
		const out = applyFilters(RECORDS, { ...none, collections: new Set(['my.custom.rel']) });
		expect(out.records.map((r) => r.rkey)).toEqual(['ddd']);
	});

	// the trap: prefix matching must respect dot boundaries, or app.bsky
	// silently swallows app.bskyfoo
	it('matches a namespace prefix only on dot boundaries', () => {
		const out = applyFilters(RECORDS, { ...none, collections: new Set(['app.bsky']) });
		expect(out.records.map((r) => r.rkey).sort()).toEqual(['aaa', 'bbb']);
		expect(out.records.some((r) => r.col === 'app.bskyfoo.thing')).toBe(false);
	});

	it('treats an empty collection set as no filter, not as match-nothing', () => {
		expect(applyFilters(RECORDS, { ...none, collections: new Set() }).matched).toBe(4);
	});

	it('bounds by timeframe inclusively at both edges', () => {
		const out = applyFilters(RECORDS, { ...none, from: T('2025-06-01'), to: T('2026-01-01') });
		expect(out.records.map((r) => r.rkey)).toEqual(['bbb', 'ccc']);
	});

	it('accepts an open-ended range', () => {
		expect(applyFilters(RECORDS, { ...none, from: T('2026-01-01'), to: null }).matched).toBe(2);
		expect(applyFilters(RECORDS, { ...none, from: null, to: T('2025-01-01') }).matched).toBe(1);
	});

	it('searches inside nested record values', () => {
		const out = applyFilters(RECORDS, { ...none, query: 'needle' });
		expect(out.records.map((r) => r.rkey)).toEqual(['ddd']);
	});

	it('searches collection and rkey too, case-insensitively', () => {
		expect(applyFilters(RECORDS, { ...none, query: 'FEED.LIKE' }).matched).toBe(1);
		expect(applyFilters(RECORDS, { ...none, query: 'CCC' }).matched).toBe(1);
	});

	it('treats a whitespace-only query as no filter', () => {
		expect(applyFilters(RECORDS, { ...none, query: '   ' }).matched).toBe(4);
	});

	it('ANDs every filter together', () => {
		const out = applyFilters(RECORDS, {
			collections: new Set(['app.bsky']),
			from: T('2025-05-01'),
			to: null,
			query: 'at://'
		});
		expect(out.records.map((r) => r.rkey)).toEqual(['bbb']);
	});

	it('reports filtered and total byte weight separately', () => {
		const out = applyFilters(RECORDS, { ...none, collections: new Set(['my.custom.rel']) });
		expect(out.bytes).toBe(40);
		expect(out.totalBytes).toBe(100);
		expect(out.matched).toBe(1);
		expect(out.total).toBe(4);
	});

	it('survives a record with no value', () => {
		const out = applyFilters([{ col: 'a.b.c', rkey: 'x', ts: 0, bytes: 1 }], { ...none, query: 'zzz' });
		expect(out.matched).toBe(0);
	});

	// ~25 records in a real repo have no decodable TID and no createdAt --
	// singleton `self`-keyed config records, one per collection. They must not
	// coerce through null == 0 into "the dawn of time".
	describe('records with no timestamp', () => {
		const undated = [
			...RECORDS,
			{ col: 'blue.linkat.board', rkey: 'self', ts: null, bytes: 50, value: { cards: [] } }
		];

		it('keeps an undated record when no timeframe is set', () => {
			const out = applyFilters(undated, none);
			expect(out.matched).toBe(5);
			expect(out.bytes).toBe(150);
		});

		it('excludes an undated record whenever any bound is set', () => {
			// unknown time cannot be shown to fall inside a requested range, in
			// either direction -- so both bounds must exclude it, and the `to`-only
			// case is the one a null-coercing comparison gets wrong
			expect(applyFilters(undated, { ...none, from: T('2020-01-01') }).matched).toBe(4);
			expect(applyFilters(undated, { ...none, to: T('2030-01-01') }).matched).toBe(4);
		});

		it('still searches an undated record by content', () => {
			expect(applyFilters(undated, { ...none, query: 'linkat' }).matched).toBe(1);
		});
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/repo/filter.spec.js`
Expected: FAIL — `Failed to resolve import "./filter.js"`

- [ ] **Step 3: Write the implementation**

Create `src/lib/repo/filter.js`:

```js
/**
 * Filtering, as pure data. No DOM, no renderer assumptions -- the treemap
 * re-lays out on whatever survives, so a filtered view is a smaller true map
 * rather than a dimmed version of a bigger one.
 */

/**
 * Does `nsid` sit at or under `sel`?
 *
 * Matching has to respect dot boundaries: `app.bsky` selects
 * `app.bsky.feed.like` but must NOT swallow `app.bskyfoo.thing`. A bare
 * `startsWith` gets this wrong and the mistake is invisible until someone owns
 * a namespace with a shared prefix.
 *
 * @param {string} nsid
 * @param {string} sel
 */
function underNamespace(nsid, sel) {
	return nsid === sel || nsid.startsWith(`${sel}.`);
}

/**
 * @param {Array<any>} records
 * @param {{collections: Set<string>, from: number|null, to: number|null, query: string}} f
 */
export function applyFilters(records, f) {
	const { collections, from, to, query } = f;
	const q = (query ?? '').trim().toLowerCase();
	const byCol = collections && collections.size > 0;

	const out = [];
	let bytes = 0;
	let totalBytes = 0;

	for (const r of records) {
		totalBytes += r.bytes || 0;

		if (byCol && ![...collections].some((sel) => underNamespace(r.col, sel))) continue;

		// An undated record -- no decodable TID, no createdAt -- cannot be shown
		// to fall inside a requested range, so any bound excludes it. Testing
		// `r.ts` directly would coerce null to 0: `null < from` is true (excluded)
		// but `null > to` is false (INCLUDED), so a to-only filter would silently
		// keep records it cannot place.
		if ((from != null || to != null) && r.ts == null) continue;
		if (from != null && r.ts < from) continue;
		if (to != null && r.ts > to) continue;

		if (q) {
			const hay = `${r.col} ${r.rkey} ${r.value ? JSON.stringify(r.value) : ''}`.toLowerCase();
			if (!hay.includes(q)) continue;
		}

		out.push(r);
		bytes += r.bytes || 0;
	}

	return { records: out, matched: out.length, total: records.length, bytes, totalBytes };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/repo/filter.spec.js`
Expected: PASS, 12 tests

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(repo): filter by collection, timeframe and content

Pure function over records so the treemap can re-lay out on the matching
set -- a filtered view is a smaller true map, not a dimmed larger one.

Namespace matching respects dot boundaries: app.bsky must not swallow
app.bskyfoo, a mistake that stays invisible until someone owns a
namespace with a shared prefix.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Hit testing

**Files:**
- Create: `src/lib/repo/hittest.js`, `src/lib/repo/hittest.spec.js`

**Interfaces:**
- Consumes: the `blocks` array from `buildTreemap`
- Produces: `buildIndex(blocks, w, h, cellSize?) → Index`, `hitTest(index, x, y) → {nsid, rkey, col, ts, bytes, err, aggregate}|null`

- [ ] **Step 1: Write the failing test**

Create `src/lib/repo/hittest.spec.js`. This gets real coverage because a bug here opens the wrong record — and that modal has a delete button:

```js
import { describe, it, expect } from 'vitest';
import { buildIndex, hitTest } from './hittest.js';
import { buildTreemap } from './treemap.js';
import { collectionHues } from './hues.js';

/** Two blocks side by side, four cells each. */
const BLOCKS = [
	{
		nsid: 'a.b.left',
		x: 0, y: 0, w: 100, h: 100,
		aggregate: false,
		cells: [
			{ x: 0, y: 0, w: 50, h: 50, col: 'a.b.left', rkey: 'lt', ts: 1, bytes: 5, err: '' },
			{ x: 50, y: 0, w: 50, h: 50, col: 'a.b.left', rkey: 'rt', ts: 2, bytes: 6, err: '' },
			{ x: 0, y: 50, w: 50, h: 50, col: 'a.b.left', rkey: 'lb', ts: 3, bytes: 7, err: '' },
			{ x: 50, y: 50, w: 50, h: 50, col: 'a.b.left', rkey: 'rb', ts: 4, bytes: 8, err: '' }
		]
	},
	{
		nsid: 'a.b.right',
		x: 100, y: 0, w: 100, h: 100,
		aggregate: true,
		rkey: 'agg',
		records: 900,
		bytes: 900,
		cells: []
	}
];

describe('hitTest', () => {
	const index = buildIndex(BLOCKS, 200, 100);

	it('resolves a point to the cell containing it', () => {
		expect(hitTest(index, 25, 25).rkey).toBe('lt');
		expect(hitTest(index, 75, 25).rkey).toBe('rt');
		expect(hitTest(index, 25, 75).rkey).toBe('lb');
		expect(hitTest(index, 75, 75).rkey).toBe('rb');
	});

	// cells are laid out edge to edge; an off-by-one here means the wrong
	// record opens in a modal that can delete it
	it('assigns a boundary point to exactly one cell', () => {
		const hit = hitTest(index, 50, 25);
		expect(hit).not.toBeNull();
		expect(['lt', 'rt']).toContain(hit.rkey);
	});

	it('reports an aggregated block as aggregate rather than inventing a record', () => {
		const hit = hitTest(index, 150, 50);
		expect(hit.aggregate).toBe(true);
		expect(hit.nsid).toBe('a.b.right');
		expect(hit.records).toBe(900);
	});

	it('returns null outside every block', () => {
		expect(hitTest(index, 500, 500)).toBeNull();
		expect(hitTest(index, -5, 10)).toBeNull();
	});

	it('carries the fields the modal needs', () => {
		const hit = hitTest(index, 25, 25);
		expect(hit).toMatchObject({ col: 'a.b.left', rkey: 'lt', ts: 1, bytes: 5 });
	});

	it('agrees with a real treemap layout at every cell centre', () => {
		const records = Array.from({ length: 24 }, (_, i) => ({
			col: i % 2 ? 'a.b.one' : 'a.b.two',
			ts: 1000 + i,
			rkey: `r${i}`,
			bytes: 100,
			errs: 0,
			errNames: []
		}));
		const { hueOf } = collectionHues(records);
		const { blocks } = buildTreemap(records, { w: 600, h: 400, weigh: 'records', hueOf });
		const idx = buildIndex(blocks, 600, 400);

		let checked = 0;
		for (const b of blocks) {
			for (const c of b.cells) {
				const hit = hitTest(idx, b.x + c.x + c.w / 2, b.y + c.y + c.h / 2);
				expect(hit?.rkey).toBe(c.rkey);
				checked++;
			}
		}
		expect(checked).toBeGreaterThan(0);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/repo/hittest.spec.js`
Expected: FAIL — `Failed to resolve import "./hittest.js"`

- [ ] **Step 3: Write the implementation**

Create `src/lib/repo/hittest.js`. Note that cell coordinates in `buildTreemap` are relative to their block, so the index stores absolute rectangles:

```js
/**
 * Pointer → record, for the canvas renderer.
 *
 * The DOM gave this for free: one button per record, and the browser did the
 * hit testing. Canvas has no DOM, so a bug here opens the WRONG record in a
 * modal that can delete it. Hence a uniform grid index and real tests.
 *
 * Cell coordinates from buildTreemap are relative to their block; this index
 * stores absolute rectangles so lookup is a single comparison.
 */

const DEFAULT_CELL = 32;

/**
 * @param {Array<any>} blocks from buildTreemap
 * @param {number} w canvas width
 * @param {number} h canvas height
 * @param {number} [cellSize] grid bucket edge, in px
 */
export function buildIndex(blocks, w, h, cellSize = DEFAULT_CELL) {
	const cols = Math.max(1, Math.ceil(w / cellSize));
	const rows = Math.max(1, Math.ceil(h / cellSize));
	/** @type {Array<Array<any>>} */
	const buckets = Array.from({ length: cols * rows }, () => []);

	const put = (rect) => {
		const x0 = Math.max(0, Math.floor(rect.x / cellSize));
		const x1 = Math.min(cols - 1, Math.floor((rect.x + rect.w) / cellSize));
		const y0 = Math.max(0, Math.floor(rect.y / cellSize));
		const y1 = Math.min(rows - 1, Math.floor((rect.y + rect.h) / cellSize));
		for (let gy = y0; gy <= y1; gy++) {
			for (let gx = x0; gx <= x1; gx++) buckets[gy * cols + gx].push(rect);
		}
	};

	for (const b of blocks) {
		if (b.aggregate || !b.cells?.length) {
			put({
				x: b.x, y: b.y, w: b.w, h: b.h,
				hit: {
					nsid: b.nsid, col: b.nsid, rkey: b.rkey ?? null,
					records: b.records, bytes: b.bytes, aggregate: true
				}
			});
			continue;
		}
		for (const c of b.cells) {
			put({
				x: b.x + c.x, y: b.y + c.y, w: c.w, h: c.h,
				hit: {
					nsid: b.nsid, col: c.col, rkey: c.rkey, ts: c.ts,
					bytes: c.bytes, err: c.err, aggregate: false
				}
			});
		}
	}

	return { buckets, cols, rows, cellSize, w, h };
}

/**
 * @param {ReturnType<typeof buildIndex>} index
 * @param {number} x
 * @param {number} y
 */
export function hitTest(index, x, y) {
	if (x < 0 || y < 0 || x > index.w || y > index.h) return null;

	const gx = Math.min(index.cols - 1, Math.floor(x / index.cellSize));
	const gy = Math.min(index.rows - 1, Math.floor(y / index.cellSize));
	if (gx < 0 || gy < 0) return null;

	const bucket = index.buckets[gy * index.cols + gx];
	if (!bucket) return null;

	// last match wins: cells are pushed after their block, so a real record
	// beats the aggregate rectangle it sits inside
	let found = null;
	for (const r of bucket) {
		if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) found = r.hit;
	}
	return found;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/repo/hittest.spec.js`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(repo): grid spatial index for canvas hit testing

The DOM gave pointer-to-record resolution for free. Canvas does not, and
a bug here opens the wrong record in a modal that can delete it -- so
this gets a uniform grid index and coverage at every cell centre of a
real layout, not just synthetic rectangles.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Canvas treemap renderer

**Files:**
- Modify: `src/lib/components/Treemap.svelte` (replace entirely)

**Interfaces:**
- Consumes: `buildTreemap`, `buildIndex`, `hitTest`, `fmtBytes`, `fmtNum`
- Produces: component props `{records, hueOf, weigh (bindable), exact, onhover, onopen}`

- [ ] **Step 1: Replace the component**

Replace `src/lib/components/Treemap.svelte` entirely:

```svelte
<script>
	import { buildTreemap } from '$lib/repo/treemap.js';
	import { buildIndex, hitTest } from '$lib/repo/hittest.js';
	import { fmtBytes, fmtNum } from '$lib/repo/format.js';

	let {
		records = [],
		hueOf,
		weigh = $bindable('bytes'),
		exact = true,
		onhover,
		onopen
	} = $props();

	let canvas = $state(null);
	let w = $state(900);
	let h = $state(600);
	let dpr = $state(1);

	// never lay out into a collapsed container: everything would silently
	// collapse into "too small to resolve" and read as if that were the truth
	const map = $derived(
		buildTreemap(records, { w: Math.max(w, 700), h: Math.max(h, 460), weigh, hueOf })
	);
	const index = $derived(buildIndex(map.blocks, Math.max(w, 700), Math.max(h, 460)));
	const totalBytes = $derived(records.reduce((s, r) => s + (r.bytes || 0), 0));

	$effect(() => {
		if (!canvas) return;
		dpr = window.devicePixelRatio || 1;
		draw(canvas, map, w, h, dpr);
	});

	/**
	 * Batch by fill colour: setting fillStyle per record would be ~200k state
	 * changes on a large repo, where grouping makes it a few thousand.
	 */
	function draw(cv, m, cw, ch, ratio) {
		cv.width = Math.round(cw * ratio);
		cv.height = Math.round(ch * ratio);
		cv.style.width = `${cw}px`;
		cv.style.height = `${ch}px`;

		const ctx = cv.getContext('2d');
		ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
		ctx.clearRect(0, 0, cw, ch);

		const byColour = new Map();
		for (const b of m.blocks) {
			if (b.aggregate || !b.cells.length) {
				// treemap.js only sets block.color on aggregated blocks; an empty
				// collection has neither cells nor a colour, and passing undefined
				// to fillStyle silently paints the previous colour
				if (!b.color) continue;
				const list = byColour.get(b.color) ?? [];
				list.push([b.x, b.y, b.w, b.h]);
				byColour.set(b.color, list);
				continue;
			}
			for (const c of b.cells) {
				const list = byColour.get(c.color) ?? [];
				list.push([b.x + c.x, b.y + c.y, c.w, c.h]);
				byColour.set(c.color, list);
			}
		}

		for (const [colour, rects] of byColour) {
			ctx.fillStyle = colour;
			for (const [x, y, rw, rh] of rects) ctx.fillRect(x, y, rw, rh);
		}

		// labels last, so no cell paints over them
		ctx.font = '8.5px "IBM Plex Mono", monospace';
		ctx.textBaseline = 'top';
		for (const b of m.blocks) {
			if (!b.label) continue;
			const tw = ctx.measureText(b.label).width;
			ctx.fillStyle = 'rgba(255,255,255,0.84)';
			ctx.fillRect(b.x, b.y, tw + 6, 12);
			ctx.fillStyle = '#161a18';
			ctx.fillText(b.label, b.x + 3, b.y + 2);
		}
	}

	function at(ev) {
		const r = canvas.getBoundingClientRect();
		return hitTest(index, ev.clientX - r.left, ev.clientY - r.top);
	}
</script>

<div class="map" bind:clientWidth={w} bind:clientHeight={h}>
	<canvas
		bind:this={canvas}
		onmousemove={(e) => onhover?.(at(e))}
		onmouseleave={() => onhover?.(null)}
		onclick={(e) => {
			const hit = at(e);
			if (hit) onopen?.(hit);
		}}
		aria-label="Treemap of repository contents. {fmtNum(records.length)} records."
		role="img"
	></canvas>

	<div class="info">
		{map.leaves} collections · {fmtNum(records.length)} records · {fmtBytes(totalBytes)}
		{exact ? 'measured' : 'estimated'} ·
		{fmtNum(map.cells)} cells = one record each{map.aggregated
			? ` · ${map.aggregated} blocks too small to resolve, shown whole`
			: ''}
		<button class="wt" onclick={() => (weigh = weigh === 'bytes' ? 'records' : 'bytes')}>
			sized by {weigh === 'bytes' ? 'bytes' : 'record count'}
		</button>
	</div>
</div>

<style>
	.map {
		position: absolute;
		inset: 0;
		overflow: hidden;
	}
	canvas {
		display: block;
		cursor: pointer;
	}
	.info {
		position: absolute;
		left: 18px;
		bottom: 16px;
		max-width: calc(100% - 220px);
		flex-wrap: wrap;
		font-family: 'IBM Plex Mono', monospace;
		font-size: 10.5px;
		color: var(--ink);
		background: var(--paper);
		border: 1px solid var(--rule);
		padding: 5px 9px;
		display: flex;
		gap: 10px;
		align-items: center;
	}
	.wt {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 10px;
		padding: 2px 6px;
		border: 1px solid var(--ink);
		background: transparent;
		color: var(--ink);
		cursor: pointer;
	}
	.wt:hover {
		background: var(--ink);
		color: var(--paper);
	}
</style>
```

- [ ] **Step 2: Verify the component compiles**

Run: `npx svelte-check --tsconfig ./jsconfig.json --threshold error 2>&1 | grep -i treemap`
Expected: no errors naming `Treemap.svelte`. Other files may still error; those are fixed in Task 18.

- [ ] **Step 3: Run the suite**

Run: `npm test`
Expected: PASS, unchanged count — this task adds no tests, because the logic it depends on is already covered in `treemap.spec.js` and `hittest.spec.js`. The drawing itself is verified in the browser in Task 20.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(ui): draw the treemap to a canvas

One div per record does not survive a 186,958-record repo. Canvas does:
drawn cells are bounded by viewport area over the 2.5px aggregation
threshold, roughly 150k at 1200x800, no matter how large the repo is.

Fills are batched by colour so a large repo costs a few thousand
fillStyle changes rather than one per record, and the backing store is
scaled by devicePixelRatio so hairlines stay hairlines.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

# Phase D — Authentication and writes

## Task 10: OAuth client metadata and session

**Files:**
- Create: `static/oauth-client-metadata.json`, `src/lib/atproto/session.svelte.js`, `src/lib/atproto/session.spec.js`
- Modify: `vite.config.js`

**Interfaces:**
- Consumes: `@atproto/oauth-client-browser`
- Produces:
  - `CLIENT_ID`, `SCOPE` constants
  - `hasRepoWrite(grantedScope) → boolean`
  - `createSessionStore() → {init(), signIn(handle), signOut(), get did(), get handle(), get canWrite()}`

- [ ] **Step 1: Write the client metadata**

Create `static/oauth-client-metadata.json`. The `client_id` must exactly equal the URL this file is served from:

```json
{
	"client_id": "https://pixeline.be/pds-grandperspective/oauth-client-metadata.json",
	"client_name": "GrandPerspective — PDS edition",
	"client_uri": "https://pixeline.be/pds-grandperspective/",
	"redirect_uris": ["https://pixeline.be/pds-grandperspective/"],
	"grant_types": ["authorization_code", "refresh_token"],
	"response_types": ["code"],
	"scope": "atproto repo:*?action=update&action=delete",
	"token_endpoint_auth_method": "none",
	"application_type": "web",
	"dpop_bound_access_tokens": true
}
```

- [ ] **Step 2: Write the failing test for scope gating**

Create `src/lib/atproto/session.spec.js`:

```js
import { describe, it, expect } from 'vitest';
import { hasRepoWrite, SCOPE } from './session.svelte.js';

describe('SCOPE', () => {
	// repo:* is the full wildcard, which the permission spec allows; partial
	// wildcards like repo:app.bsky.* are prohibited. `create` is absent because
	// this app never creates records.
	it('requests update and delete on any collection, and nothing more', () => {
		expect(SCOPE).toBe('atproto repo:*?action=update&action=delete');
		expect(SCOPE).not.toContain('transition:generic');
		expect(SCOPE).not.toContain('action=create');
	});
});

describe('hasRepoWrite', () => {
	it('accepts the scope we asked for', () => {
		expect(hasRepoWrite('atproto repo:*?action=update&action=delete')).toBe(true);
	});

	it('accepts a server that granted the broader legacy scope', () => {
		expect(hasRepoWrite('atproto transition:generic')).toBe(true);
	});

	it('accepts an unparameterised wildcard, which means all actions', () => {
		expect(hasRepoWrite('atproto repo:*')).toBe(true);
	});

	// the failure this guards: an older auth server narrows the grant and the
	// app must go read-only rather than showing buttons that fail on click
	it('rejects a grant narrowed to identity only', () => {
		expect(hasRepoWrite('atproto')).toBe(false);
	});

	it('rejects a grant narrowed to a single collection', () => {
		expect(hasRepoWrite('atproto repo:app.bsky.feed.post?action=delete')).toBe(false);
	});

	// reading a field the SDK does not expose yields undefined; defaulting that
	// to "allowed" would show delete buttons backed by no grant at all
	it('rejects undefined, null and empty rather than defaulting to allowed', () => {
		expect(hasRepoWrite(undefined)).toBe(false);
		expect(hasRepoWrite(null)).toBe(false);
		expect(hasRepoWrite('')).toBe(false);
	});
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/lib/atproto/session.spec.js`
Expected: FAIL — `Failed to resolve import "./session.svelte.js"`

- [ ] **Step 4: Write the session module**

Create `src/lib/atproto/session.svelte.js`. **The `.svelte.js` extension is required, not stylistic** — this module uses `$state`, and Svelte only compiles runes in `.svelte` and `.svelte.js` files. In a plain `.js` file `$state` is an undefined identifier and fails at runtime:

```js
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

		async signIn(input) {
			if (!client) throw new Error('session not initialised');
			await client.signIn(input.trim().replace(/^@/, ''), { scope: SCOPE });
		},

		async signOut() {
			await agent?.signOut?.();
			agent = null;
			did = null;
			handle = null;
			canWrite = false;
		}
	};
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/atproto/session.spec.js`
Expected: PASS, 7 tests

- [ ] **Step 6: Bind the dev server to 127.0.0.1**

Modify `vite.config.js`. Add a `server` block inside `defineConfig`, directly after the `plugins` array:

```js
	server: {
		// the OAuth loopback client requires the literal IP; the spec rejects
		// the hostname `localhost` as a redirect target. The port is left to
		// .claude/launch.json, which already pins 5199 -- any port works, the
		// host is the part that matters.
		host: '127.0.0.1'
	},
```

- [ ] **Step 7: Verify the metadata is served and the dev server binds correctly**

```bash
npm run dev -- --port 5199 --strictPort &
sleep 5
curl -sS http://127.0.0.1:5199/oauth-client-metadata.json
kill %1
```

Expected: the JSON from Step 1, served over the literal loopback IP. If `curl` connects on `127.0.0.1` the host binding is right — that is the part the OAuth loopback client requires.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(auth): atproto OAuth session with wildcard repo write scope

Requests exactly atproto repo:*?action=update&action=delete. The
wildcard is necessary because granular repo:<nsid> scopes must name
collections in static metadata and this tool acts on lexicons it has
never seen. It is still far narrower than transition:generic, which
would also grant blob upload, preferences, and service proxying --
and create is absent because the app never creates records.

hasRepoWrite rejects undefined rather than defaulting to allowed: the
SDK does not expose session.scope on every session type, and treating a
missing grant as permission would show delete buttons backed by nothing.

Dev server binds 127.0.0.1 because the loopback client rejects the
hostname localhost as a redirect target.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Write operations

**Files:**
- Create: `src/lib/atproto/write.js`, `src/lib/atproto/write.spec.js`

**Interfaces:**
- Consumes: an OAuth agent from `session.svelte.js`
- Produces:
  - `validateEdit(originalValue, text) → {ok: true, value} | {ok: false, reason: string}`
  - `putRecord(agent, {did, col, rkey, value}) → Promise<void>`
  - `deleteRecord(agent, {did, col, rkey}) → Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `src/lib/atproto/write.spec.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { validateEdit, putRecord, deleteRecord } from './write.js';

describe('validateEdit', () => {
	const original = { $type: 'app.bsky.feed.post', text: 'hello' };

	it('accepts a well-formed edit that keeps $type', () => {
		const out = validateEdit(original, '{"$type":"app.bsky.feed.post","text":"changed"}');
		expect(out.ok).toBe(true);
		expect(out.value.text).toBe('changed');
	});

	it('rejects unparseable JSON with a reason', () => {
		const out = validateEdit(original, '{not json');
		expect(out.ok).toBe(false);
		expect(out.reason).toMatch(/JSON/i);
	});

	// changing $type makes the record a different kind of thing at the same
	// key, which is not a move this tool offers
	it('rejects a changed $type', () => {
		const out = validateEdit(original, '{"$type":"other.thing","text":"x"}');
		expect(out.ok).toBe(false);
		expect(out.reason).toMatch(/\$type/);
	});

	it('rejects introducing a $type where the original had none', () => {
		const out = validateEdit({ n: 1 }, '{"$type":"something.new","n":1}');
		expect(out.ok).toBe(false);
		expect(out.reason).toMatch(/\$type/);
	});

	it('accepts an edit when neither side has a $type', () => {
		expect(validateEdit({ n: 1 }, '{"n":2}').ok).toBe(true);
	});

	it('rejects a non-object top level', () => {
		expect(validateEdit(original, '[1,2,3]').ok).toBe(false);
		expect(validateEdit(original, '"a string"').ok).toBe(false);
		expect(validateEdit(original, 'null').ok).toBe(false);
	});
});

/** A stand-in for OAuthSession, which exposes fetchHandler(pathname, init). */
function fakeSession(respond = async () => new Response('{}', { status: 200 })) {
	const calls = [];
	return {
		calls,
		fetchHandler: async (pathname, init) => {
			calls.push({ pathname, body: JSON.parse(init.body), method: init.method });
			return respond();
		}
	};
}

describe('putRecord', () => {
	it('posts to the putRecord xrpc endpoint with the right body', async () => {
		const session = fakeSession();
		await putRecord(session, {
			did: 'did:plc:abc',
			col: 'a.b.c',
			rkey: 'k1',
			value: { $type: 'a.b.c' }
		});
		expect(session.calls[0].pathname).toBe('/xrpc/com.atproto.repo.putRecord');
		expect(session.calls[0].method).toBe('POST');
		expect(session.calls[0].body).toEqual({
			repo: 'did:plc:abc',
			collection: 'a.b.c',
			rkey: 'k1',
			record: { $type: 'a.b.c' }
		});
	});

	it('propagates the server error verbatim rather than swallowing it', async () => {
		const session = fakeSession(
			async () =>
				new Response(JSON.stringify({ error: 'InvalidRecord', message: 'missing field' }), {
					status: 400
				})
		);
		await expect(
			putRecord(session, { did: 'd', col: 'c', rkey: 'k', value: {} })
		).rejects.toThrow(/InvalidRecord/);
	});
});

describe('deleteRecord', () => {
	it('posts to the deleteRecord xrpc endpoint with the right body', async () => {
		const session = fakeSession();
		await deleteRecord(session, { did: 'did:plc:abc', col: 'a.b.c', rkey: 'k1' });
		expect(session.calls[0].pathname).toBe('/xrpc/com.atproto.repo.deleteRecord');
		expect(session.calls[0].body).toEqual({
			repo: 'did:plc:abc',
			collection: 'a.b.c',
			rkey: 'k1'
		});
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/atproto/write.spec.js`
Expected: FAIL — `Failed to resolve import "./write.js"`

- [ ] **Step 3: Write the implementation**

Create `src/lib/atproto/write.js`:

```js
/**
 * Writes against the signed-in user's own repo.
 *
 * Only update and delete: the app never creates records, which is why `create`
 * is absent from the requested scope.
 */

/**
 * Check an edited record before it is written.
 *
 * `$type` must not change. Changing it would make the record a different kind
 * of thing at the same key -- a move this tool does not offer, and one that
 * could leave the owning app unable to read its own data. The rule holds in
 * both directions, including introducing a `$type` where there was none.
 *
 * @param {any} originalValue
 * @param {string} text
 * @returns {{ok: true, value: any} | {ok: false, reason: string}}
 */
export function validateEdit(originalValue, text) {
	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch (e) {
		return { ok: false, reason: `Not valid JSON: ${e?.message ?? e}` };
	}

	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
		return { ok: false, reason: 'A record must be a JSON object.' };
	}

	const before = originalValue?.$type ?? null;
	const after = parsed.$type ?? null;
	if (before !== after) {
		return {
			ok: false,
			reason: `$type must stay ${before ?? '(absent)'}; this edit makes it ${after ?? '(absent)'}.`
		};
	}

	return { ok: true, value: parsed };
}

/**
 * Post an XRPC procedure through the OAuth session.
 *
 * `OAuthSession` exposes `fetchHandler(pathname, init)` -- it has no `.call()`.
 * Going through it directly rather than wrapping it in `@atproto/api`'s Agent
 * keeps a third runtime dependency out of the project, and DPoP, token refresh
 * and nonce handling are all inside the handler already.
 *
 * @param {any} session
 * @param {string} nsid
 * @param {any} body
 */
async function procedure(session, nsid, body) {
	const res = await session.fetchHandler(`/xrpc/${nsid}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});

	if (!res.ok) {
		// surface what the server said, not a generic failure
		const detail = await res.text().catch(() => '');
		let msg = detail;
		try {
			const j = JSON.parse(detail);
			msg = [j.error, j.message].filter(Boolean).join(': ') || detail;
		} catch {
			/* not JSON — the raw body is the best available detail */
		}
		throw new Error(`${res.status} ${msg}`.trim());
	}
}

/**
 * @param {any} session OAuth session
 * @param {{did: string, col: string, rkey: string, value: any}} p
 */
export async function putRecord(session, { did, col, rkey, value }) {
	await procedure(session, 'com.atproto.repo.putRecord', {
		repo: did,
		collection: col,
		rkey,
		record: value
	});
}

/**
 * @param {any} session OAuth session
 * @param {{did: string, col: string, rkey: string}} p
 */
export async function deleteRecord(session, { did, col, rkey }) {
	await procedure(session, 'com.atproto.repo.deleteRecord', {
		repo: did,
		collection: col,
		rkey
	});
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/atproto/write.spec.js`
Expected: PASS, 9 tests

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(atproto): putRecord and deleteRecord with edit validation

$type must not change in either direction, including introducing one
where there was none -- that would make the record a different kind of
thing at the same key and could leave the owning app unable to read its
own data.

Server errors propagate verbatim so a failed write is never presented as
a success.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

# Phase E — Interface

## Task 12: URL state

**Files:**
- Create: `src/lib/repo/urlstate.js`, `src/lib/repo/urlstate.spec.js`

**Interfaces:**
- Consumes: nothing
- Produces: `toHash(state) → string`, `fromHash(hash) → state` where state is `{handle, weigh, collections: Set<string>, from: number|null, to: number|null, query: string}`

- [ ] **Step 1: Write the failing test**

Create `src/lib/repo/urlstate.spec.js`:

```js
import { describe, it, expect } from 'vitest';
import { toHash, fromHash, defaultState } from './urlstate.js';

describe('urlstate', () => {
	it('omits everything that is at its default', () => {
		expect(toHash(defaultState())).toBe('#');
	});

	it('round-trips a fully populated state', () => {
		const state = {
			handle: 'pixeline.be',
			weigh: 'records',
			collections: new Set(['app.bsky', 'my.custom.rel']),
			from: Date.parse('2025-01-01T00:00:00Z'),
			to: Date.parse('2026-01-01T00:00:00Z'),
			query: 'needle'
		};
		const back = fromHash(toHash(state));
		expect(back.handle).toBe('pixeline.be');
		expect(back.weigh).toBe('records');
		expect([...back.collections].sort()).toEqual(['app.bsky', 'my.custom.rel']);
		expect(back.from).toBe(state.from);
		expect(back.to).toBe(state.to);
		expect(back.query).toBe('needle');
	});

	it('drops the retired stack keys instead of restoring them', () => {
		const back = fromHash('#h=a.test&gap=90&twist=16&cap=4000&v=stack&ax=-24');
		expect(back.handle).toBe('a.test');
		expect(back).not.toHaveProperty('gap');
		expect(back).not.toHaveProperty('cap');
		expect(back).not.toHaveProperty('v');
	});

	it('survives a malformed hash rather than throwing', () => {
		const back = fromHash('#from=notadate&weigh=purple&to=');
		expect(back.from).toBeNull();
		expect(back.weigh).toBe('bytes');
	});

	it('handles an empty hash', () => {
		expect(fromHash('')).toEqual(defaultState());
		expect(fromHash('#')).toEqual(defaultState());
	});

	it('encodes dates as ISO days, so the URL stays readable', () => {
		const h = toHash({ ...defaultState(), from: Date.parse('2025-03-04T00:00:00Z') });
		expect(h).toContain('from=2025-03-04');
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/repo/urlstate.spec.js`
Expected: FAIL — `Failed to resolve import "./urlstate.js"`

- [ ] **Step 3: Write the implementation**

Create `src/lib/repo/urlstate.js`:

```js
/**
 * The viewable state lives in the hash, so a filtered view is shareable.
 *
 * The stack keys (v, gap, twist, depth, decay, tiles, cam, ax, ay) and the
 * record ceiling (cap) are gone. An old URL carrying them still resolves --
 * they are simply ignored rather than restored.
 */

export function defaultState() {
	return {
		handle: '',
		weigh: 'bytes',
		collections: new Set(),
		from: null,
		to: null,
		query: ''
	};
}

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

/** @param {ReturnType<typeof defaultState>} s */
export function toHash(s) {
	const q = new URLSearchParams();
	if (s.handle) q.set('h', s.handle);
	if (s.weigh && s.weigh !== 'bytes') q.set('weigh', s.weigh);
	if (s.collections?.size) q.set('c', [...s.collections].sort().join(','));
	if (s.from != null) q.set('from', isoDay(s.from));
	if (s.to != null) q.set('to', isoDay(s.to));
	if (s.query?.trim()) q.set('q', s.query.trim());
	return `#${q.toString()}`;
}

/** @param {string} hash */
export function fromHash(hash) {
	const q = new URLSearchParams(String(hash ?? '').replace(/^#/, ''));
	const s = defaultState();

	s.handle = q.get('h') || '';
	if (q.get('weigh') === 'records') s.weigh = 'records';

	const cols = q.get('c');
	if (cols) s.collections = new Set(cols.split(',').filter(Boolean));

	for (const k of /** @type {const} */ (['from', 'to'])) {
		const raw = q.get(k);
		if (!raw) continue;
		const ms = Date.parse(raw);
		if (Number.isFinite(ms)) s[k] = ms;
	}

	s.query = q.get('q') || '';
	return s;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/repo/urlstate.spec.js`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(repo): hash round-trip for the new state shape

Handle, weigh mode, collection filter, timeframe and query. The stack
keys and the record ceiling are ignored rather than restored, so an old
shared URL still resolves to a valid view.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Firehose loading display

**Files:**
- Create: `src/lib/components/Firehose.svelte`

**Interfaces:**
- Consumes: `fmtBytes`, `fmtNum`
- Produces: component props `{phase, bytes, records, collections, lines, elapsed}` where `lines` is an array of `{ts, col, rkey, bytes}` capped by the caller

- [ ] **Step 1: Create the component**

Create `src/lib/components/Firehose.svelte`:

```svelte
<script>
	import { fmtBytes, fmtNum } from '$lib/repo/format.js';

	let {
		phase = 'resolving',
		bytes = 0,
		records = 0,
		collections = 0,
		lines = [],
		elapsed = 0
	} = $props();

	const secs = $derived(Math.max(elapsed / 1000, 0.001));
	const recPerSec = $derived(records > 0 ? Math.round(records / secs) : 0);
	const kbPerSec = $derived(bytes > 0 ? Math.round(bytes / 1024 / secs) : 0);

	const label = $derived(
		{
			resolving: 'resolving identity',
			receiving: 'receiving',
			parsing: 'parsing',
			listing: 'listing records'
		}[phase] ?? phase
	);

	const hhmmss = (ts) => new Date(ts).toISOString().slice(11, 19);
</script>

<div class="fh">
	<div class="stream" aria-hidden="true">
		{#each lines as l (l.rkey + l.col)}
			<div class="ln">
				<span class="t">{hhmmss(l.ts)}</span>
				<span class="c">{l.col}</span>
				<span class="k">{l.rkey}</span>
				<span class="b">{l.bytes} B</span>
			</div>
		{/each}
	</div>

	<div class="read" role="status" aria-live="polite">
		<div class="phase">{label}</div>
		<dl>
			<div><dt>records</dt><dd>{fmtNum(records)}</dd></div>
			<div><dt>bytes</dt><dd>{fmtBytes(bytes)}</dd></div>
			<div><dt>collections</dt><dd>{collections}</dd></div>
			<div><dt>rec/s</dt><dd>{fmtNum(recPerSec)}</dd></div>
			<div><dt>KB/s</dt><dd>{fmtNum(kbPerSec)}</dd></div>
			<div><dt>elapsed</dt><dd>{secs.toFixed(1)} s</dd></div>
		</dl>
	</div>
</div>

<style>
	.fh {
		position: absolute;
		inset: 0;
		display: grid;
		grid-template-columns: 1fr auto;
		align-items: end;
		gap: 32px;
		padding: 32px;
		background: var(--ground);
		font-family: 'IBM Plex Mono', monospace;
		overflow: hidden;
	}
	.stream {
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		height: 100%;
		overflow: hidden;
		font-size: 10.5px;
		line-height: 1.55;
		color: var(--ink-soft);
	}
	.ln {
		display: grid;
		grid-template-columns: 68px minmax(0, 1fr) 116px 72px;
		gap: 14px;
		white-space: nowrap;
	}
	/* the newest lines are the legible ones; older ones recede */
	.ln:nth-last-child(n + 12) { opacity: 0.35; }
	.ln:nth-last-child(-n + 3) { color: var(--ink); }
	.c { overflow: hidden; text-overflow: ellipsis; }
	.k, .b { text-align: right; }
	.read { text-align: right; }
	.phase {
		font-family: 'Archivo', sans-serif;
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--ink-soft);
		margin-bottom: 14px;
	}
	dl { margin: 0; display: flex; flex-direction: column; gap: 8px; }
	dl > div { display: grid; grid-template-columns: auto 128px; gap: 16px; align-items: baseline; }
	dt {
		font-family: 'Archivo', sans-serif;
		font-size: 8.5px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-soft);
	}
	dd { margin: 0; font-size: 22px; font-weight: 500; letter-spacing: -0.02em; }
	@media (prefers-reduced-motion: reduce) {
		.ln:nth-last-child(n + 12) { opacity: 1; }
	}
</style>
```

- [ ] **Step 2: Verify it compiles**

Run: `npx svelte-check --tsconfig ./jsconfig.json --threshold error 2>&1 | grep -i firehose`
Expected: no errors naming `Firehose.svelte`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(ui): show the read itself while it happens

Every line is a record that actually arrived, not an animation of a
loading process. Counters stay exact even when the visible lines are
sampled, which they must be -- a CAR parse resolves thousands of records
per frame.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Record modal

**Files:**
- Create: `src/lib/components/RecordModal.svelte`

**Interfaces:**
- Consumes: `validateEdit`, `putRecord`, `deleteRecord` from `write.js`; `fmtBytes`, `fmtDate` from `format.js`
- Produces: props `{record, did, agent, canWrite, isOwnRepo, onclose, onchanged}`. `onchanged({action, record})` fires with `action` of `'updated' | 'deleted'` so the caller can patch local state.

- [ ] **Step 1: Create the component**

Create `src/lib/components/RecordModal.svelte`:

```svelte
<script>
	import { validateEdit, putRecord, deleteRecord } from '$lib/atproto/write.js';
	import { fmtBytes, fmtDate } from '$lib/repo/format.js';
	import { tidToMs } from '$lib/atproto/tid.js';

	let {
		record = null,
		did = null,
		agent = null,
		canWrite = false,
		isOwnRepo = false,
		onclose,
		onchanged
	} = $props();

	let editing = $state(false);
	let confirming = $state(false);
	let text = $state('');
	let problem = $state(null);
	let busy = $state(false);

	const writable = $derived(isOwnRepo && canWrite && !!agent && !record?.aggregate);

	const tidTime = $derived(record?.rkey ? tidToMs(record.rkey) : null);
	const claimed = $derived(
		record?.value?.createdAt ? Date.parse(record.value.createdAt) : null
	);
	// the TID is server-assigned, createdAt is user-claimed; a disagreement is
	// information, not noise, so it is shown rather than resolved away
	const skewed = $derived(
		tidTime != null && claimed != null && Math.abs(tidTime - claimed) > 864e5
	);

	const readOnlyReason = $derived(
		record?.aggregate
			? 'This block is too small to resolve to one record.'
			: !isOwnRepo
				? 'You can only edit records in your own repository.'
				: !agent
					? 'Sign in to edit your own records.'
					: !canWrite
						? 'Your authorization server did not grant repository write access.'
						: null
	);

	function startEdit() {
		text = JSON.stringify(record.value, null, 2);
		problem = null;
		editing = true;
	}

	async function save() {
		const check = validateEdit(record.value, text);
		if (!check.ok) {
			problem = check.reason;
			return;
		}
		busy = true;
		problem = null;
		try {
			await putRecord(agent, { did, col: record.col, rkey: record.rkey, value: check.value });
			onchanged?.({ action: 'updated', record, value: check.value });
			editing = false;
		} catch (e) {
			// surface the XRPC error verbatim and leave local state untouched
			problem = String(e?.message ?? e);
		} finally {
			busy = false;
		}
	}

	async function remove() {
		busy = true;
		problem = null;
		try {
			await deleteRecord(agent, { did, col: record.col, rkey: record.rkey });
			onchanged?.({ action: 'deleted', record });
			onclose?.();
		} catch (e) {
			problem = String(e?.message ?? e);
			confirming = false;
		} finally {
			busy = false;
		}
	}

	function pdsls() {
		const url = `https://pdsls.dev/at://${did}/${record.col}/${record.rkey}`;
		// a synthetic link, not window.open: a features string makes it a popup,
		// which blockers kill silently
		const a = document.createElement('a');
		a.href = url;
		a.target = '_blank';
		a.rel = 'noopener noreferrer';
		document.body.appendChild(a);
		a.click();
		a.remove();
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose?.()} />

{#if record}
	<div
		class="scrim"
		role="button"
		tabindex="-1"
		aria-label="Close"
		onclick={() => onclose?.()}
		onkeydown={(e) => e.key === 'Enter' && onclose?.()}
	></div>

	<div class="modal" role="dialog" aria-modal="true" aria-label="Record {record.rkey}">
		<header>
			<h2>{record.col}</h2>
			<button class="x" onclick={() => onclose?.()} aria-label="Close">close</button>
		</header>

		<dl class="meta">
			<div><dt>rkey</dt><dd>{record.rkey ?? '—'}</dd></div>
			<div><dt>stored</dt><dd>{fmtBytes(record.bytes ?? 0)}</dd></div>
			{#if tidTime != null}
				<div><dt>tid time</dt><dd>{fmtDate(tidTime)}</dd></div>
			{/if}
			{#if claimed != null}
				<div class:skew={skewed}>
					<dt>createdAt</dt>
					<dd>{fmtDate(claimed)}{skewed ? ' — disagrees with the TID' : ''}</dd>
				</div>
			{/if}
			{#if record.err}
				<div><dt>errors</dt><dd>{record.err}</dd></div>
			{/if}
		</dl>

		{#if record.aggregate}
			<p class="note">
				{record.records} records, {fmtBytes(record.bytes)}. This block is drawn whole because its
				cells would be smaller than a pixel — no single record is being shown.
			</p>
		{:else if editing}
			<textarea bind:value={text} spellcheck="false" aria-label="Record JSON"></textarea>
		{:else}
			<pre>{JSON.stringify(record.value, null, 2)}</pre>
		{/if}

		{#if problem}
			<p class="problem">{problem}</p>
		{/if}

		<footer>
			<button class="ghost" onclick={pdsls}>Open on pdsls.dev</button>

			{#if writable}
				{#if editing}
					<button onclick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
					<button class="ghost" onclick={() => (editing = false)} disabled={busy}>Cancel</button>
				{:else if confirming}
					<button class="danger" onclick={remove} disabled={busy}>
						{busy ? 'Deleting…' : 'Confirm delete'}
					</button>
					<button class="ghost" onclick={() => (confirming = false)} disabled={busy}>Keep</button>
				{:else}
					<button onclick={startEdit}>Edit</button>
					<button class="ghost" onclick={() => (confirming = true)}>Delete</button>
				{/if}
			{:else if readOnlyReason}
				<span class="ro">{readOnlyReason}</span>
			{/if}
		</footer>
	</div>
{/if}

<style>
	.scrim {
		position: fixed;
		inset: 0;
		background: color-mix(in srgb, var(--ink) 32%, transparent);
		border: 0;
		z-index: 20;
	}
	.modal {
		position: fixed;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		width: min(760px, calc(100vw - 48px));
		max-height: calc(100vh - 64px);
		display: flex;
		flex-direction: column;
		gap: 14px;
		background: var(--paper);
		border: 1px solid var(--ink);
		padding: 20px;
		z-index: 21;
	}
	header { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; }
	h2 {
		margin: 0;
		font-size: 14px;
		font-weight: 800;
		letter-spacing: -0.02em;
		font-family: 'IBM Plex Mono', monospace;
		overflow-wrap: anywhere;
	}
	.meta { margin: 0; display: flex; flex-wrap: wrap; gap: 6px 28px; font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; }
	.meta > div { display: flex; gap: 8px; }
	dt { color: var(--ink-soft); }
	dd { margin: 0; }
	.skew dd { font-weight: 500; }
	pre, textarea {
		margin: 0;
		flex: 1;
		min-height: 220px;
		overflow: auto;
		font-family: 'IBM Plex Mono', monospace;
		font-size: 11px;
		line-height: 1.5;
		background: var(--ground);
		border: 1px solid var(--rule);
		padding: 10px;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		color: var(--ink);
		resize: vertical;
	}
	.problem, .note, .ro { margin: 0; font-size: 11px; line-height: 1.5; color: var(--ink-soft); }
	.problem { color: var(--ink); border-left: 2px solid var(--ink); padding-left: 10px; }
	footer { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
	footer .ro { margin-left: auto; text-align: right; }
	button {
		font-family: 'Archivo', sans-serif;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		padding: 9px 12px;
		border: 1px solid var(--ink);
		background: var(--ink);
		color: var(--paper);
		cursor: pointer;
	}
	button.ghost { background: transparent; color: var(--ink); }
	button.danger { background: var(--paper); color: var(--ink); border-width: 2px; }
	button:disabled { opacity: 0.35; cursor: default; }
	.x { background: transparent; color: var(--ink-soft); border: 0; padding: 4px; }
</style>
```

- [ ] **Step 2: Verify it compiles**

Run: `npx svelte-check --tsconfig ./jsconfig.json --threshold error 2>&1 | grep -i recordmodal`
Expected: no errors naming `RecordModal.svelte`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(ui): record modal with edit and two-step delete

Shows the TID time and the claimed createdAt side by side when they
disagree -- the TID is server-assigned and createdAt is user-claimed, so
a disagreement is information rather than noise.

Read-only states say WHY they are read-only rather than hiding the
controls. Failed writes surface the XRPC error verbatim and leave local
state untouched.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Footer credits

**Files:**
- Create: `src/lib/components/Footer.svelte`

**Interfaces:**
- Consumes: nothing
- Produces: no props

- [ ] **Step 1: Create the component**

Create `src/lib/components/Footer.svelte`. The copy and both URLs are fixed by the global constraints — the SourceForge slug has no trailing `e`:

```svelte
<footer class="credits">
	<span>
		Made by <a href="https://bsky.app/profile/pixeline.be" target="_blank" rel="noopener noreferrer"
			>@pixeline.be</a
		>
	</span>
	<span aria-hidden="true">·</span>
	<span>
		Treemap concept and name after
		<a href="https://grandperspectiv.sourceforge.net/" target="_blank" rel="noopener noreferrer"
			>GrandPerspective</a
		>
		by Erwin Bonsma
	</span>
</footer>

<style>
	.credits {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		align-items: baseline;
		font-family: 'IBM Plex Mono', monospace;
		font-size: 9.5px;
		line-height: 1.5;
		color: var(--ink-soft);
	}
	a {
		color: var(--ink);
		text-decoration: none;
		border-bottom: 1px solid var(--rule);
	}
	a:hover {
		border-bottom-color: var(--ink);
	}
</style>
```

- [ ] **Step 2: Verify the links are exactly right**

```bash
grep -o 'https://[^"]*' src/lib/components/Footer.svelte
```

Expected exactly:
```
https://bsky.app/profile/pixeline.be
https://grandperspectiv.sourceforge.net/
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(ui): credits footer

Credits GrandPerspective by Erwin Bonsma in the interface rather than
only in a README nobody opens -- the borrowed name is the reason the
credit needs to be visible on every screen.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Rail — target, session, filters, readouts

**Files:**
- Modify: `src/lib/components/Rail.svelte` (replace entirely)

**Interfaces:**
- Consumes: `Typeahead`, `Footer`, `fmtBytes`, `fmtNum`
- Produces: props `{handle (bindable), filters (bindable), busy, status, stats, legend, errors, hueOf, session, ondraw, onstop, onsignin, onsignout}`. `filters` is `{collections: Set, from, to, query}`.

- [ ] **Step 1: Replace the component**

Replace `src/lib/components/Rail.svelte` entirely:

```svelte
<script>
	import Typeahead from './Typeahead.svelte';
	import Footer from './Footer.svelte';
	import { fmtBytes, fmtNum } from '$lib/repo/format.js';

	let {
		handle = $bindable(''),
		filters = $bindable({ collections: new Set(), from: null, to: null, query: '' }),
		busy = false,
		status = 'idle',
		stats = null,
		legend = [],
		errors = [],
		hueOf,
		session = null,
		ondraw,
		onstop,
		onsignin,
		onsignout
	} = $props();

	let signInHandle = $state('');

	const isoDay = (ms) => (ms == null ? '' : new Date(ms).toISOString().slice(0, 10));

	function setDate(key, value) {
		const ms = value ? Date.parse(`${value}T00:00:00Z`) : null;
		filters = { ...filters, [key]: Number.isFinite(ms) ? ms : null };
	}

	function toggleCollection(nsid) {
		const next = new Set(filters.collections);
		if (next.has(nsid)) next.delete(nsid);
		else next.add(nsid);
		filters = { ...filters, collections: next };
	}
</script>

<aside class="rail">
	<h1>GrandPerspective<small>PDS EDITION</small></h1>

	<div class="grp">
		<span class="lbl">Repository</span>
		<Typeahead bind:value={handle} onsubmit={(h) => ondraw(h)} />
		<div class="row">
			<button onclick={() => ondraw()} disabled={busy}>Read</button>
			<button class="ghost" onclick={() => onstop()} disabled={!busy}>Stop</button>
		</div>
	</div>

	<hr />

	<div class="grp">
		<span class="lbl">Session</span>
		{#if session?.did}
			<p class="note">Signed in as <b>{session.handle}</b></p>
			{#if !session.canWrite}
				<p class="note warn">
					Your authorization server did not grant repository write access. Editing is disabled.
				</p>
			{/if}
			<button class="ghost" onclick={() => onsignout()}>Sign out</button>
		{:else}
			<p class="note">Sign in to edit or delete records in your own repository.</p>
			<input
				class="txt"
				type="text"
				placeholder="your.handle"
				bind:value={signInHandle}
				onkeydown={(e) => e.key === 'Enter' && onsignin(signInHandle)}
			/>
			<button onclick={() => onsignin(signInHandle)}>Sign in</button>
			{#if session?.error}
				<p class="note warn">{session.error}</p>
			{/if}
		{/if}
	</div>

	<hr />

	<div class="grp">
		<span class="lbl">Filter</span>
		<input
			class="txt"
			type="search"
			placeholder="search record content"
			value={filters.query}
			oninput={(e) => (filters = { ...filters, query: e.currentTarget.value })}
		/>
		<div class="row">
			<label class="dt">
				<span>from</span>
				<input type="date" value={isoDay(filters.from)} onchange={(e) => setDate('from', e.currentTarget.value)} />
			</label>
			<label class="dt">
				<span>to</span>
				<input type="date" value={isoDay(filters.to)} onchange={(e) => setDate('to', e.currentTarget.value)} />
			</label>
		</div>
		{#if filters.collections.size}
			<button
				class="ghost sm"
				onclick={() => (filters = { ...filters, collections: new Set() })}
			>
				clear {filters.collections.size} collection filter{filters.collections.size > 1 ? 's' : ''}
			</button>
		{/if}
	</div>

	<hr />

	<div class="grp">
		<span class="lbl">Measured</span>
		<table>
			<tbody>
				<tr><td class="k">status</td><td class="v">{status}</td></tr>
				{#if stats}
					<tr><td class="k">pds</td><td class="v">{stats.pds}</td></tr>
					<tr><td class="k">collections</td><td class="v">{stats.collections}</td></tr>
					<tr><td class="k">records</td><td class="v">{fmtNum(stats.records)}</td></tr>
					<tr><td class="k">stored size</td><td class="v">{fmtBytes(stats.bytes)}</td></tr>
					<tr>
						<td class="k">sizes</td>
						<td class="v">{stats.exact ? 'measured (CAR)' : 'estimated (listRecords)'}</td>
					</tr>
					{#if stats.rev}
						<tr><td class="k">revision</td><td class="v">{stats.rev}</td></tr>
					{/if}
					<tr><td class="k">first record</td><td class="v">{stats.first}</td></tr>
					{#if stats.undated}
						<tr><td class="k">undated</td><td class="v">{stats.undated}</td></tr>
					{/if}
					<tr>
						<td class="k">invalid</td>
						<td class="v">{stats.invalid} ({stats.invalidPct}%)</td>
					</tr>
					{#if stats.matched !== stats.records}
						<tr><td class="k">showing</td><td class="v">{fmtNum(stats.matched)}</td></tr>
					{/if}
				{/if}
			</tbody>
		</table>
	</div>

	<div class="grp">
		<span class="lbl">Hue = collection</span>
		<div class="legend">
			{#if legend.length}
				{#each legend as [col, n] (col)}
					<button
						class="leg"
						class:on={filters.collections.has(col)}
						onclick={() => toggleCollection(col)}
						title="{col} — click to filter"
					>
						<i style="background:hsl({hueOf.get(col)} 74% 50%)"></i>
						<span>{col}</span>
						<b>{fmtNum(n)}</b>
					</button>
				{/each}
			{:else}
				<p class="note">Nothing read yet.</p>
			{/if}
		</div>
	</div>

	<div class="grp">
		<span class="lbl">Errors found</span>
		<div class="errs">
			{#if errors.length}
				{#each errors as [name, n] (name)}
					<div class="e"><span>{name}</span><b>{n}</b></div>
				{/each}
			{:else if stats}
				<p class="note">No invalid records. That is the honest result, not a bug.</p>
			{:else}
				<p class="note">Errors are reported, never decorated.</p>
			{/if}
		</div>
	</div>

	<hr />
	<Footer />
</aside>

<style>
	.rail {
		background: var(--paper);
		border-right: 1px solid var(--rule);
		padding: 18px 16px 32px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	h1 { font-size: 15px; font-weight: 800; letter-spacing: -0.03em; text-transform: uppercase; margin: 0; line-height: 1.05; }
	h1 small { display: block; font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; color: var(--ink-soft); margin-top: 5px; }
	.grp { display: flex; flex-direction: column; gap: 8px; }
	.lbl { font-size: 9px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink-soft); }
	button {
		font-family: 'Archivo', sans-serif;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		padding: 9px 10px;
		border: 1px solid var(--ink);
		background: var(--ink);
		color: var(--paper);
		cursor: pointer;
	}
	button.ghost { background: transparent; color: var(--ink); }
	button.sm { padding: 5px 8px; font-size: 9px; }
	button:disabled { opacity: 0.35; cursor: default; }
	.row { display: flex; gap: 6px; }
	.row > * { flex: 1; }
	.txt {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 11px;
		padding: 8px;
		border: 1px solid var(--rule);
		background: var(--ground);
		color: var(--ink);
		width: 100%;
	}
	.dt { display: flex; flex-direction: column; gap: 3px; }
	.dt span { font-size: 8.5px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-soft); }
	.dt input {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 10.5px;
		padding: 6px;
		border: 1px solid var(--rule);
		background: var(--ground);
		color: var(--ink);
		width: 100%;
	}
	table { width: 100%; border-collapse: collapse; font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; }
	td { padding: 2px 0; vertical-align: top; }
	td.k { color: var(--ink-soft); }
	td.v { text-align: right; font-weight: 500; }
	.legend, .errs { display: flex; flex-direction: column; gap: 3px; }
	.leg {
		display: grid;
		grid-template-columns: 11px 1fr auto;
		gap: 7px;
		align-items: center;
		font-family: 'IBM Plex Mono', monospace;
		font-size: 10px;
		background: transparent;
		border: 0;
		border-left: 2px solid transparent;
		padding: 1px 0 1px 4px;
		color: var(--ink);
		text-transform: none;
		letter-spacing: 0;
		font-weight: 400;
		text-align: left;
		cursor: pointer;
	}
	.leg.on { border-left-color: var(--ink); }
	.leg i { width: 11px; height: 11px; display: block; }
	.leg span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: rtl; text-align: left; }
	.leg b { font-weight: 500; color: var(--ink-soft); }
	.errs { font-family: 'IBM Plex Mono', monospace; font-size: 10px; color: var(--ink-soft); }
	.e { display: flex; justify-content: space-between; gap: 8px; }
	hr { border: 0; border-top: 1px solid var(--rule); margin: 0; }
	.note { font-size: 10px; line-height: 1.45; color: var(--ink-soft); margin: 0; }
	.note.warn { color: var(--ink); border-left: 2px solid var(--ink); padding-left: 8px; }
</style>
```

- [ ] **Step 2: Verify it compiles**

Run: `npx svelte-check --tsconfig ./jsconfig.json --threshold error 2>&1 | grep -i rail`
Expected: no errors naming `Rail.svelte`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(ui): rail carries target, session, filters and readouts

No sliders -- five of the six parameters died with the stack and the
sixth, the record ceiling, died with the partial read. The legend is now
a control as well as a key.

The measured table states whether sizes are measured from the CAR or
estimated from JSON lengths, so an estimate is never mistaken for a
measurement.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: Neutral palette and the global reset

**Files:**
- Modify: `src/routes/+layout.svelte`

**Interfaces:**
- Consumes: nothing
- Produces: CSS custom properties `--ground`, `--ground-deep`, `--ink`, `--ink-soft`, `--rule`, `--paper`

- [ ] **Step 1: Replace the style block**

In `src/routes/+layout.svelte`, replace the entire `<style>` block:

```svelte
<style>
	:global(:root) {
		/* true neutrals: the only hue on screen comes from the repo. The old
		   greens were deliberate when the brief wanted the portrait "suspended
		   in air"; that framing is retired with the stack. */
		--ground: #f7f7f7;
		--ground-deep: #ededed;
		--ink: #171717;
		--ink-soft: #737373;
		--rule: #e4e4e4;
		--paper: #ffffff;
	}
	:global(*) {
		box-sizing: border-box;
		/* International Style applied to data: no ornament that carries no
		   information. Enforced by a test, because standing constraints decay. */
		border-radius: 0;
		box-shadow: none;
	}
	:global(html),
	:global(body) {
		margin: 0;
		height: 100%;
	}
	:global(body) {
		background: var(--ground);
		color: var(--ink);
		font-family: 'Archivo', system-ui, sans-serif;
		overflow: hidden;
	}
	@media (prefers-reduced-motion: reduce) {
		:global(*) {
			animation-duration: 0.01ms !important;
			transition-duration: 0.01ms !important;
		}
	}
</style>
```

- [ ] **Step 2: Verify no green remains in the palette**

```bash
grep -E '^\s+--(ground|ink|rule|paper)' src/routes/+layout.svelte
```

Expected: every value is a neutral grey — the three hex pairs of each colour are equal (e.g. `#f7f7f7`), except `--ink-soft` and `--ink` which are also neutral.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
style: true neutrals and a global no-ornament reset

The old greens were deliberate when the brief wanted the portrait
suspended in air. That framing retired with the stack, and chroma now
belongs to the data alone.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: Wire it together

**Files:**
- Modify: `src/routes/+page.svelte` (replace entirely)

**Interfaces:**
- Consumes: everything from Tasks 1–17
- Produces: the running app

- [ ] **Step 1: Replace the page**

Replace `src/routes/+page.svelte` entirely:

```svelte
<script>
	import { onMount } from 'svelte';
	import Gate from '$lib/components/Gate.svelte';
	import Rail from '$lib/components/Rail.svelte';
	import Treemap from '$lib/components/Treemap.svelte';
	import Firehose from '$lib/components/Firehose.svelte';
	import RecordModal from '$lib/components/RecordModal.svelte';
	import Tip from '$lib/components/Tip.svelte';
	import { readRepo } from '$lib/atproto/read.js';
	import { createSessionStore } from '$lib/atproto/session.svelte.js';
	import { collectionHues } from '$lib/repo/hues.js';
	import { applyFilters } from '$lib/repo/filter.js';
	import { defaultState, fromHash, toHash } from '$lib/repo/urlstate.js';

	const session = createSessionStore();

	let handle = $state('');
	let weigh = $state('bytes');
	let filters = $state({ collections: new Set(), from: null, to: null, query: '' });

	let data = $state(null);
	let hues = $state(null);
	let status = $state('idle');
	let busy = $state(false);
	let error = $state(null);
	let hover = $state(null);
	let selected = $state(null);
	let entered = $state(false);

	// firehose state
	let phase = $state('resolving');
	let gotBytes = $state(0);
	let gotRecords = $state(0);
	let lines = $state([]);
	let startedAt = $state(0);
	let elapsed = $state(0);

	let ac = null;
	let ticker = null;

	const filtered = $derived(data ? applyFilters(data.records, filters) : null);
	const legend = $derived(
		hues ? [...hues.shares.entries()].sort((a, b) => b[1] - a[1]) : []
	);
	const errors = $derived(data ? [...data.errorTally.entries()].sort((a, b) => b[1] - a[1]) : []);
	const isOwnRepo = $derived(!!session.did && !!data && session.did === data.did);

	const stats = $derived.by(() => {
		if (!data || !filtered) return null;
		const invalid = data.records.reduce((s, r) => s + (r.errs ? 1 : 0), 0);
		return {
			pds: new URL(data.pds).host,
			collections: data.collections.length,
			records: data.records.length,
			matched: filtered.matched,
			bytes: filtered.totalBytes,
			exact: data.exact,
			rev: data.rev,
			invalid,
			invalidPct: data.records.length
				? ((invalid / data.records.length) * 100).toFixed(2)
				: '0.00',
			// undated records sort last, but do not depend on position: scan for
			// the earliest record that actually has a timestamp
			first: (() => {
				let earliest = null;
				for (const r of data.records) {
					if (r.ts != null && (earliest == null || r.ts < earliest)) earliest = r.ts;
				}
				return earliest == null ? '—' : new Date(earliest).toISOString().slice(0, 10);
			})(),
			undated: data.records.reduce((s, r) => s + (r.ts == null ? 1 : 0), 0)
		};
	});

	$effect(() => {
		if (!data && !handle) return;
		history.replaceState(null, '', toHash({ ...defaultState(), handle, weigh, ...filters }));
	});

	async function draw(who = null) {
		// take the handle explicitly: a two-way binding may not have propagated
		// by the time a select callback fires
		if (who) handle = who;
		if (!handle.trim()) return;

		ac?.abort();
		ac = new AbortController();
		const mine = ac;

		busy = true;
		entered = true;
		error = null;
		hover = null;
		selected = null;
		gotBytes = 0;
		gotRecords = 0;
		lines = [];
		phase = 'resolving';
		startedAt = Date.now();
		elapsed = 0;
		clearInterval(ticker);
		ticker = setInterval(() => (elapsed = Date.now() - startedAt), 100);

		try {
			const d = await readRepo(handle, {
				signal: mine.signal,
				onProgress: (e) => {
					phase = e.phase;
					status = e.message;
					if (e.bytes != null) gotBytes = e.bytes;
					if (e.records != null) gotRecords = e.records;
				},
				onSizeGate: async (bytes) =>
					confirm(
						`Read so far: ${(bytes / 1048576).toFixed(0)} MB.\n\n` +
							`This repository is unusually large and will use roughly 4x that in memory.\n\n` +
							`Continue reading?`
					)
			});
			if (mine.signal.aborted) return;

			hues = collectionHues(d.records);
			data = d;
			gotRecords = d.records.length;
			// the firehose showed real records; end on the true final lines
			lines = d.records.slice(-24).map((r) => ({
				ts: r.ts, col: r.col, rkey: r.rkey, bytes: r.bytes
			}));
			status = d.exact ? 'read complete (measured)' : 'read complete (estimated)';
		} catch (err) {
			if (mine.signal.aborted) {
				status = 'stopped';
				return;
			}
			status = 'failed';
			error =
				String(err?.message) === 'size-limit'
					? 'Stopped: the repository exceeded the size limit and reading was declined.'
					: String(err?.message ?? err);
		} finally {
			busy = false;
			clearInterval(ticker);
		}
	}

	function onchanged({ action, record, value }) {
		if (!data) return;
		if (action === 'deleted') {
			data = { ...data, records: data.records.filter((r) => r.rkey !== record.rkey || r.col !== record.col) };
		} else if (action === 'updated') {
			data = {
				...data,
				records: data.records.map((r) =>
					r.rkey === record.rkey && r.col === record.col
						? { ...r, value, bytes: JSON.stringify(value).length, exact: false }
						: r
				)
			};
		}
		hues = collectionHues(data.records);
	}

	onMount(async () => {
		// the OAuth callback arrives as ?code=…&state=… on this same route, so it
		// MUST be resolved before the hash is read or the redirect races the
		// state restore
		await session.init();

		const s = fromHash(location.hash);
		handle = s.handle;
		weigh = s.weigh;
		filters = { collections: s.collections, from: s.from, to: s.to, query: s.query };
		if (s.handle) draw();
	});
</script>

<svelte:head>
	<title>GrandPerspective — PDS edition</title>
	<meta
		name="description"
		content="See where an atproto repository's bytes actually go, and act on what you find."
	/>
</svelte:head>

<div class="app" class:entry={!entered}>
	{#if entered}
		<Rail
			bind:handle
			bind:filters
			{busy}
			{status}
			{stats}
			{legend}
			{errors}
			hueOf={hues?.hueOf}
			{session}
			ondraw={draw}
			onstop={() => ac?.abort()}
			onsignin={(h) => session.signIn(h)}
			onsignout={() => session.signOut()}
		/>
	{/if}

	<main class="stage">
		{#if !entered}
			<Gate bind:handle onpick={(who) => draw(who)} />
		{:else if busy}
			<Firehose
				{phase}
				bytes={gotBytes}
				records={gotRecords}
				collections={data?.collections.length ?? 0}
				{lines}
				{elapsed}
			/>
		{:else if data && hues && filtered}
			<Treemap
				records={filtered.records}
				hueOf={hues.hueOf}
				bind:weigh
				exact={data.exact}
				onhover={(h) => (hover = h)}
				onopen={(h) => (selected = h)}
			/>
			<Tip info={hover} hueOf={hues.hueOf} />
		{/if}

		{#if error}
			<div class="msg">
				<b>cannot read that repository</b>
				<p>{error}</p>
				<p class="fine">
					If the handle resolves, the likely cause is CORS: a PDS must send
					<code>Access-Control-Allow-Origin</code> on <code>/xrpc/</code> for a browser to read it.
				</p>
			</div>
		{/if}
	</main>
</div>

<RecordModal
	record={selected}
	did={data?.did}
	agent={session.agent}
	canWrite={session.canWrite}
	{isOwnRepo}
	onclose={() => (selected = null)}
	{onchanged}
/>

<style>
	.app { display: grid; grid-template-columns: 320px 1fr; height: 100%; }
	.app.entry { grid-template-columns: 1fr; }
	.stage { position: relative; overflow: hidden; background: var(--ground); }
	.msg {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		max-width: 440px;
		text-align: center;
		font-size: 12px;
		line-height: 1.5;
		background: var(--paper);
		border: 1px solid var(--rule);
		padding: 16px 20px;
		z-index: 7;
	}
	.msg b {
		display: block;
		font-weight: 800;
		letter-spacing: -0.02em;
		font-size: 15px;
		margin-bottom: 6px;
		text-transform: uppercase;
	}
	.msg p { margin: 0; color: var(--ink-soft); }
	.msg .fine { margin-top: 8px; font-size: 11px; }
	code {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 11px;
		background: var(--ground-deep);
		padding: 1px 4px;
	}
	@media (max-width: 820px) {
		.app { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
	}
</style>
```

- [ ] **Step 2: Fix `Gate.svelte` and `Tip.svelte` to match the new props**

Run: `npx svelte-check --tsconfig ./jsconfig.json --threshold error`

Read the errors, then make these two changes.

**`Gate.svelte`** previously called `onpick(view, handle)` because there were two viewers to choose between. There is one now, so the first argument is gone: change every call like `onpick('stack', h)` or `onpick('map', h)` to `onpick(h)`. If the gate renders two buttons — one per viewer — collapse them into a single "Read repository" action.

**`Tip.svelte`** must lose any branch reading `info.plate`; plates were stack-only. Keep the branches for `nsid`, `col`, `rkey`, `bytes`, `ts` and `err`, which are exactly the fields `hitTest` returns.

- [ ] **Step 3: Verify the whole project typechecks**

Run: `npx svelte-check --tsconfig ./jsconfig.json --threshold error`
Expected: no errors.

- [ ] **Step 4: Run the suite and build**

Run: `npm test && npm run build`
Expected: all tests PASS, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: wire the treemap tool together

session.init() runs before the hash is read: the OAuth callback lands as
?code=&state= on this same route, and letting the hash restore run first
races it.

Writes patch local state rather than triggering a re-read, and an edited
record is remarked as estimated because its new size is a JSON length,
not a measurement from the CAR.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

# Phase F — Verify

## Task 19: Guard the visual constraints with a test

**Files:**
- Create: `src/lib/style.spec.js`

**Interfaces:**
- Consumes: the source tree
- Produces: nothing

- [ ] **Step 1: Write the test**

Create `src/lib/style.spec.js`:

```js
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function sourceFiles(dir, out = []) {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) sourceFiles(p, out);
		else if (/\.(svelte|css)$/.test(name)) out.push(p);
	}
	return out;
}

const FILES = sourceFiles('src');

/** Report every offending file rather than just the first. */
function offenders(pattern, allow = () => false) {
	const hits = [];
	for (const f of FILES) {
		for (const [i, line] of readFileSync(f, 'utf8').split('\n').entries()) {
			if (pattern.test(line) && !allow(line)) hits.push(`${f}:${i + 1} ${line.trim()}`);
		}
	}
	return hits;
}

// standing constraints decay without a check. These are the ones the design
// states as prohibitions, so they are asserted rather than trusted.
describe('visual language', () => {
	it('has no rounded corners other than an explicit reset to 0', () => {
		expect(offenders(/border-radius/, (l) => /border-radius:\s*0(;|\s|$)/.test(l))).toEqual([]);
	});

	it('has no drop shadows other than an explicit reset to none', () => {
		expect(
			offenders(/box-shadow|drop-shadow/, (l) => /box-shadow:\s*none(;|\s|$)/.test(l))
		).toEqual([]);
	});

	it('has no gradients', () => {
		expect(offenders(/linear-gradient|radial-gradient|conic-gradient/)).toEqual([]);
	});
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/lib/style.spec.js`
Expected: PASS, 3 tests. If any fail, the failure message names the exact file and line — remove the offending declaration rather than adding it to the allow-list.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
test: assert the visual prohibitions

No rounded corners, no shadows, no gradients. Standing constraints decay
without a check, and this one is cheap.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 20: Verify in the browser against a real repo

**Files:**
- None modified — this task produces evidence

**Interfaces:**
- Consumes: the running app
- Produces: confirmation that the render holds at 186,958 records

- [ ] **Step 1: Start the dev server**

`.claude/launch.json` already exists and pins port 5199. Add a `url` so the preview opens on the literal loopback IP rather than the `localhost` hostname, which keeps the dev origin consistent with the OAuth loopback redirect:

```json
{
	"version": "0.0.1",
	"configurations": [
		{
			"name": "dev",
			"runtimeExecutable": "npm",
			"runtimeArgs": ["run", "dev", "--", "--port", "5199", "--strictPort"],
			"port": 5199,
			"url": "http://127.0.0.1:5199",
			"autoPort": false
		}
	]
}
```

Then use the `preview_start` tool with `{name: "dev"}`.

- [ ] **Step 2: Read `pixeline.be` and watch the firehose**

Navigate to `http://127.0.0.1:5199/#h=pixeline.be`. While it loads, take a screenshot of the firehose.

Expected: phase moves `resolving` → `receiving` → `parsing`; byte counter climbs past 65 MB; record counter reaches 186,958.

- [ ] **Step 3: Confirm the treemap tells the truth**

Once drawn, check the info line and the rail.

Expected:
- records ≈ **186,958**, collections **195**
- sizes reported as **measured (CAR)**
- `app.bsky.feed.like` is visibly the dominant block — roughly 89% of the area when sized by bytes. **This is the regression check.** If it renders as a sliver comparable to a one-record collection, the old sampling defect has returned.

- [ ] **Step 4: Check for console and network errors**

Use `read_console_messages` with `onlyErrors: true` and `read_network_requests`.
Expected: no errors. Confirm the `getRepo` request returned `200 application/vnd.ipld.car`.

- [ ] **Step 5: Verify hit testing opens the right record**

Click several cells in different blocks. For each, confirm the modal's NSID matches the block hovered and that the tooltip shown before clicking named the same record.

Expected: no mismatch. A mismatch here is the `hittest.js` failure that would let a delete hit the wrong record.

- [ ] **Step 6: Verify filters re-lay out**

Type `hello` into the search box, then set a date range, then click a legend row.

Expected: the map re-squarifies each time; the rail's `showing` row appears and reports fewer than 186,958; clearing every filter restores the full map.

- [ ] **Step 7: Check the DPR crispness and the footer**

Take a screenshot. Zoom to the block labels and to the rail rules.

Expected: hairlines are crisp, not blurred — if they are soft, the `devicePixelRatio` scaling in `Treemap.svelte` is wrong. The footer credit is visible with both links.

- [ ] **Step 8: Record the findings**

If the area-based aggregation does not hold — if the tab drags badly or the frame takes visibly long to draw — note the measured numbers. The design names WebGL as the escalation behind the same data seam. Do not implement it speculatively.

- [ ] **Step 9: Commit any fixes**

```bash
git add -A
git commit -m "$(cat <<'EOF'
fix: corrections found verifying against a live repo

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

(Skip this step if nothing needed fixing.)

---

## Task 21: OAuth smoke test

**Files:**
- None modified — this task produces evidence

**Interfaces:**
- Consumes: the running app
- Produces: confirmation the auth path works end to end

> **Note:** this task requires the user's own credentials and their decision to authorize. Do not enter any credential. Ask the user to perform the sign-in themselves and report what they see.

- [ ] **Step 1: Confirm the metadata is served correctly**

```bash
curl -sS http://127.0.0.1:5173/oauth-client-metadata.json
```

Expected: `client_id`, `redirect_uris` and `scope` exactly as written in Task 10, with scope `atproto repo:*?action=update&action=delete`.

- [ ] **Step 2: Ask the user to sign in**

Ask them to enter their handle in the rail's Session block and complete authorization on their own PDS. Ask them to report: whether the consent screen appeared, what permissions it named, and whether they returned to the app signed in.

Expected: the consent screen names record update and delete — **not** full account access. If it says full account access, the scope was not applied and the request needs checking before shipping.

- [ ] **Step 3: Confirm the session and write gating**

With the user signed in and viewing their own repo, check the rail.

Expected: `Signed in as <handle>`, no write-access warning. Opening a record shows **Edit** and **Delete**.

Then navigate to a different handle. Expected: opening a record shows the read-only reason *"You can only edit records in your own repository."*

- [ ] **Step 4: Ask the user whether to test a real write**

A write modifies their live repository. Ask before doing anything: propose editing one low-value record — a `like`, say — and confirm they agree, or ask them to perform it themselves and report.

Expected on save: no error, the modal closes, and the cell resizes to reflect the new size. Do not test delete on a record they want to keep.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "$(cat <<'EOF'
fix: corrections found in the OAuth smoke test

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

(Skip this step if nothing needed fixing.)

---

## Task 22: Final check

**Files:**
- Modify: whatever the checks surface

- [ ] **Step 1: Full verification**

```bash
npm test && npx svelte-check --tsconfig ./jsconfig.json --threshold error && npm run build
```

Expected: all tests pass, no type errors, build succeeds.

- [ ] **Step 2: Confirm no stack remnants remain**

```bash
grep -rn "sessionize\|buildStack\|globalLayout\|Stills\|plate\|twist" src/ --include=*.js --include=*.svelte
```

Expected: no matches. Any hit is a leftover reference to the retired viewer.

- [ ] **Step 3: Confirm the archive branch still holds the stack**

```bash
git show archive/stills-and-frames:src/lib/components/Stack.svelte | head -5
git show archive/stills-and-frames:src/lib/portrait/layout.js | head -5
```

Expected: both files print. If either fails, the archive was created after the deletion and the stack is lost — recover it from the reflog before proceeding.

- [ ] **Step 4: Confirm the build output is relocatable**

```bash
grep -rlo 'src="/[^"]*"' build/index.html || echo "no absolute asset paths — good"
```

Expected: `no absolute asset paths — good`. The build must work when dropped into `/pds-grandperspective/`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: final verification pass

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

(Skip if nothing changed.)
