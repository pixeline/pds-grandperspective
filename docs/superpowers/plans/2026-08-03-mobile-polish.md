# Mobile Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Address five mobile-reported issues: a data-budget signal at the gate and during reads on slow networks, the railtoggle covering the top-left canvas label, illegible 8.5px labels on Android Chrome, and `standard.site` link redirection.

**Architecture:** Four independent fixes plus one gate copy change. New `src/lib/util/connection.js` exposes a network-state reader via `navigator.connection`. New `WifiWarning.svelte` component renders a dismissable banner during reads when the network is slow. `paintMap` in `src/lib/repo/paint.js` gains an optional `labelInset` argument that omits labels for blocks under the railtoggle button on mobile, called from `Treemap.svelte` which also passes a mobile `labelScale` of 1.3. `Gate.svelte` gets a fourth `<li>` in `.facts`. `appLinkFor` in `src/lib/repo/appOf.js` returns `null` for any resolved domain in a `BLOCKED_DOMAINS` set (initially just `standard.site`).

**Tech Stack:** SvelteKit 2, Svelte 5 (runes), Vitest 4, native `navigator.connection`.

## Global Constraints

These are the project's hard rules, copied from `CLAUDE.md`. Every task's requirements implicitly include them.

1. **No React.** Use SvelteKit.
2. **All repo reading happens client-side.** No server, no proxy, no credentials. Browser CORS is a real constraint.
3. **Every visual property traces to a number in the repo.** If you cannot name the source of a mark, do not draw it.
4. **Errors are reported, never decorated.** A clean repo reports zero errors, and that is the honest output.
5. **No rounded corners, no drop shadows, no gradients, no decorative motion.** International Style. Enforced by tests.
6. **Chroma belongs to the data.** Hue identifies a collection, saturation carries recency. All chrome is neutral.

Project-specific rules, from `CLAUDE.md` and observed in the existing components:

- Never reintroduce a reading ceiling. (`Findings that are load-bearing` in `CLAUDE.md`.)
- Use a synthetic `<a target="_blank">` for outbound links, not `window.open` with a features string.
- Existing mobile breakpoint is `820px`. New mobile rules live in a `@media (max-width: 820px)` block alongside existing ones.
- Existing CSS custom properties: `--ink`, `--paper`, `--ground`, `--ground-deep`, `--ink-soft`, `--rule`. Use these, never hard-coded colours.
- Existing font stacks: `'IBM Plex Mono', monospace` for data/code, `'Archivo', sans-serif` for buttons/UI chrome.
- Code style: tab indentation in source files (matches existing `.svelte`/`.js` files), 2-space indentation in tests (matches `vitest`/project tests).
- 44px minimum tap target on mobile (existing rule in `Rail.svelte` media query).
- Canvas label dimensions in `paint.js`: `LABEL_FONT_PX = 8.5`, `LABEL_BOX_PX = 12`, `LABEL_PAD_PX = 3`. The 8.5px is the desktop default; mobile scaling uses `labelScale`.

---

## File Structure

### Files created
- `src/lib/util/connection.js` — `getConnection()` reader over `navigator.connection`. Pure/ish; no state.
- `src/lib/util/connection.spec.js` — vitest tests. Mocks `globalThis.navigator.connection`.
- `src/lib/components/WifiWarning.svelte` — banner with a "Continue anyway" dismiss button.
- `src/lib/components/WifiWarning.spec.js` — light DOM tests via a wrapper is overkill; we test via `connection.spec.js` and a manual smoke. Skip the Svelte component test; the component is a thin presentational wrapper.

### Files modified
- `src/lib/repo/paint.js` — `paintMap` gains optional `labelInset: {top: number, left: number}` (default `{top: 0, left: 0}`). Label-painting loop respects it.
- `src/lib/repo/paint.spec.js` — add cases for `labelInset`.
- `src/lib/components/Treemap.svelte` — derive `labelInset` and mobile `labelScale` from `w`. Pass both into `draw()`. Keep PNG export path untouched (call site in `exportpng.js`).
- `src/lib/components/Gate.svelte` — add a fourth `<li>` to `.facts`: "Reading a PDS can use tens of MB."
- `src/lib/repo/appOf.js` — add `BLOCKED_DOMAINS = new Set(['standard.site'])`. `appLinkFor` returns `null` when the resolved domain (own or subject) is in the set.
- `src/lib/repo/appOf.spec.js` — add cases for blocked domains in both branches.
- `src/routes/+page.svelte` — read `getConnection()` on mount, listen to `change` events when supported, render `<WifiWarning>` above the firehose when `busy && connection.isSlow && !connectionDismissed`.

### Decision rationale

- `connection.js` lives in `src/lib/util/` (not `src/lib/atproto/`): it is a generic browser-API wrapper with no atproto domain knowledge.
- `WifiWarning.svelte` is a new file rather than a flag in `Firehose.svelte`: the warning is its own visual style (inline banner) and dismissing it is per-session state that belongs to the page, not the firehose.
- Label-inset and label-scale live in `paintMap`'s options bag, not new files: the painter already owns these dimensions; the painter is the seam.
- `BLOCKED_DOMAINS` is a `Set` next to `appDomainOf`: the policy is one place, and an entry in the set is the unit of change.

---

## Task 1: Block `standard.site` in `appLinkFor`

**Files:**
- Modify: `src/lib/repo/appOf.js:18-21` (insert `BLOCKED_DOMAINS`) and `src/lib/repo/appOf.js:162-184` (gate in `appLinkFor`)
- Test: `src/lib/repo/appOf.spec.js` (extend existing describe blocks)

**Interfaces:**
- Consumes: nothing new.
- Produces: `appLinkFor(nsid, did, rkey, value)` returns `null` whenever the resolved domain (own collection's `appDomainOf` or subject collection's `appDomainOf`) is in `BLOCKED_DOMAINS`. Existing `null` returns are unchanged.

### Step 1.1: Write the failing tests

Add at the end of `src/lib/repo/appOf.spec.js`, inside a new `describe('appLinkFor with blocked domains', () => { ... })`:

```js
import { describe, it, expect } from 'vitest';
import { appDomainOf, appLinkFor, BLOCKED_DOMAINS } from './appOf.js';

describe('BLOCKED_DOMAINS', () => {
	it('contains standard.site as the only entry', () => {
		expect([...BLOCKED_DOMAINS]).toEqual(['standard.site']);
	});
});

describe('appLinkFor with blocked domains', () => {
	const did = 'did:plc:abc123';
	const rkey = '3l7xyz';

	it('returns null when the record\'s own collection resolves to a blocked domain', () => {
		expect(appLinkFor('site.standard.foo', did, rkey)).toBeNull();
		expect(appLinkFor('site.standard.foo', did, rkey, {})).toBeNull();
	});

	it('returns null even when there is a deep-link path available (no route to a blocked host)', () => {
		// a Bluesky-shaped collection resolves to bsky.app, not standard.site,
		// so this proves the policy is "domain-in-set" not "nsid looks like x"
		expect(appLinkFor('app.bsky.actor.profile', did, rkey)).not.toBeNull();
	});

	it('falls back to a normal own-link when the subject is blocked but the record itself is not', () => {
		const value = {
			subject: { uri: `at://did:plc:other/site.standard.thing/abc` }
		};
		expect(appLinkFor('app.bsky.feed.like', did, rkey, value)).toEqual({
			domain: 'bsky.app',
			url: 'https://bsky.app/',
			deep: false
		});
	});

	it('returns null when BOTH subject and own domain are blocked', () => {
		const value = {
			subject: { uri: `at://did:plc:other/site.standard.bar/abc` }
		};
		expect(appLinkFor('site.standard.foo', did, rkey, value)).toBeNull();
	});

	it('does not throw when the subject is blocked and the value carries junk', () => {
		expect(() =>
			appLinkFor('site.standard.foo', did, rkey, { subject: { uri: 'not-a-url' } })
		).not.toThrow();
	});
});
```

### Step 1.2: Run the new tests to verify they fail

Run: `npm test -- src/lib/repo/appOf.spec.js`
Expected: FAIL — `BLOCKED_DOMAINS` is not exported yet, so the import errors. Specifically:
- `BLOCKED_DOMAINS` test: error on import.
- Other tests: pass-through `appLinkFor` returns the existing non-null result for `site.standard.foo`, failing the `toBeNull()` and `toEqual()` checks.

### Step 1.3: Implement `BLOCKED_DOMAINS` and the gate in `appLinkFor`

Edit `src/lib/repo/appOf.js`:

1. After the existing `const LABEL_RE = /^[a-z0-9-]+$/;` line (around line 19), add:

```js
/**
 * Hosts this tool refuses to drive traffic to. The first entry,
 * `standard.site`, is a placeholder page whose redirect is lossy enough
 * that "Open on standard.site" is not what the user asked for. Add
 * future entries here with the same justification. Empty entries
 * (someone trying to remove a block) MUST be cleared by deletion, not
 * by leaving an empty string -- `Set.has('')` matches every host.
 */
export const BLOCKED_DOMAINS = new Set(['standard.site']);
```

2. In `appLinkFor` (lines 162-184), gate both branches. Replace the body of `appLinkFor` with:

```js
export function appLinkFor(nsid, did, rkey, value) {
	const subjectRef = parseAtUri(subjectUriOf(value));
	if (subjectRef) {
		const subjectDomain = appDomainOf(subjectRef.collection);
		if (subjectDomain && !BLOCKED_DOMAINS.has(subjectDomain)) {
			const deepLink = BLUESKY_DEEP_LINKS[subjectRef.collection]?.(
				subjectRef.did,
				subjectRef.rkey
			);
			return deepLink
				? { domain: subjectDomain, url: deepLink, deep: true, subject: true }
				: { domain: subjectDomain, url: `https://${subjectDomain}/`, deep: false, subject: true };
		}
		// subject resolved to a domain we don't link to, or has no domain --
		// fall through to this record's own link below.
	}

	const domain = appDomainOf(nsid);
	if (!domain) return null;
	if (BLOCKED_DOMAINS.has(domain)) return null;
	const root = `https://${domain}/`;
	const deepLink = nsid != null && did != null ? BLUESKY_DEEP_LINKS[nsid]?.(did, rkey) : null;
	return deepLink ? { domain, url: deepLink, deep: true } : { domain, url: root, deep: false };
}
```

Note the only changes from the existing code:
- `if (subjectDomain)` becomes `if (subjectDomain && !BLOCKED_DOMAINS.has(subjectDomain))`.
- After `appDomainOf(nsid)`, an extra `if (BLOCKED_DOMAINS.has(domain)) return null;` line.

### Step 1.4: Run the tests to verify they pass

Run: `npm test -- src/lib/repo/appOf.spec.js`
Expected: PASS — all `appOf.spec.js` tests, including the new `BLOCKED_DOMAINS` block and the new `appLinkFor with blocked domains` describe.

### Step 1.5: Run the full suite for regressions

Run: `npm test`
Expected: PASS — all tests green.

### Step 1.6: Commit

```bash
git add src/lib/repo/appOf.js src/lib/repo/appOf.spec.js
git commit -m "feat(link): block standard.site in appLinkFor"
```

---

## Task 2: Add the gate data-budget fact

**Files:**
- Modify: `src/lib/components/Gate.svelte:38-47` (add a fourth `<li>` to `.facts`)

**Interfaces:**
- Consumes: nothing new.
- Produces: `.facts` renders four bullets total: existing three (every collection, cell area, sign in) plus "Reading a PDS can use tens of MB."

### Step 2.1: Edit `Gate.svelte`

In `src/lib/components/Gate.svelte`, replace the `<ul class="facts">` block (lines 38-47) with:

```svelte
<ul class="facts">
  <li>
    Every collection, including unknown lexicons. Read straight from the
    PDS.
  </li>
  <li>
    Cell area is the record's stored size, from the repository's CAR export.
  </li>
  <li>Sign in to edit or delete records in your own repository.</li>
  <li>Reading a PDS can use tens of MB.</li>
</ul>
```

No CSS changes needed: existing `.facts li` styles apply. The new bullet inherits the same `font-family: 'IBM Plex Mono', monospace; font-size: 11px; border-left: 2px solid var(--rule)` styling — matching the existing three bullets.

### Step 2.2: Smoke check

Open the gate in a browser, or confirm via reading the source that the new `<li>` is wrapped in the same `<ul class="facts">` and uses the same `<li>` markup.

### Step 2.3: Commit

```bash
git add src/lib/components/Gate.svelte
git commit -m "feat(gate): state the data budget in the facts list"
```

---

## Task 3: Add `getConnection()` reader

**Files:**
- Create: `src/lib/util/connection.js`
- Create: `src/lib/util/connection.spec.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `getConnection()` returns `{ effectiveType: string|null, saveData: boolean, isSlow: boolean }`. `isSlow` is true iff `saveData === true` OR `effectiveType` is one of `'slow-2g' | '2g' | '3g'`. When `navigator.connection` is absent (desktop, iOS Safari), returns `{ effectiveType: null, saveData: false, isSlow: false }`. Never throws.

### Step 3.1: Write the failing test

Create `src/lib/util/connection.spec.js`:

```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getConnection } from './connection.js';

/**
 * The NetworkInformation API is a navigator-level thing with no first-class
 * vitest mock, so we swap `navigator.connection` in place around each test.
 * `navigator` exists in jsdom (vitest's default env) but does not carry a
 * `connection` member; we add and remove it explicitly.
 */
function setConn(value) {
	if (value === undefined) {
		// jsdom may make the property non-configurable in some versions; fall
		// back to `undefined` assignment when delete fails.
		try {
			delete navigator.connection;
		} catch {
			Object.defineProperty(navigator, 'connection', { configurable: true, value: undefined });
		}
	} else {
		Object.defineProperty(navigator, 'connection', { configurable: true, value });
	}
}

describe('getConnection', () => {
	const original = navigator.connection;

	beforeEach(() => {
		// start each test in the absent-API state
		try {
			delete navigator.connection;
		} catch {
			Object.defineProperty(navigator, 'connection', { configurable: true, value: undefined });
		}
	});

	afterEach(() => {
		setConn(original);
	});

	it('returns isSlow:false when navigator.connection is absent', () => {
		expect(getConnection()).toEqual({
			effectiveType: null,
			saveData: false,
			isSlow: false
		});
	});

	it('classifies slow-2g, 2g, and 3g as slow', () => {
		for (const effectiveType of ['slow-2g', '2g', '3g']) {
			setConn({ effectiveType, saveData: false });
			expect(getConnection().isSlow).toBe(true);
		}
	});

	it('classifies 4g as not slow', () => {
		setConn({ effectiveType: '4g', saveData: false });
		expect(getConnection().isSlow).toBe(false);
	});

	it('treats saveData:true as slow regardless of effectiveType', () => {
		setConn({ effectiveType: '4g', saveData: true });
		expect(getConnection()).toEqual({
			effectiveType: '4g',
			saveData: true,
			isSlow: true
		});
	});

	it('treats saveData:true as slow even when effectiveType is missing', () => {
		setConn({ saveData: true });
		expect(getConnection().isSlow).toBe(true);
	});

	it('never throws on a hostile navigator.connection', () => {
		setConn(null);
		expect(() => getConnection()).not.toThrow();
		expect(getConnection().isSlow).toBe(false);
	});
});
```

### Step 3.2: Run the test to verify it fails

Run: `npm test -- src/lib/util/connection.spec.js`
Expected: FAIL — module `./connection.js` does not exist.

### Step 3.3: Implement `connection.js`

Create `src/lib/util/connection.js`:

```js
/**
 * Read the browser's NetworkInformation API for a coarse "is this
 * connection expensive?" signal. Used by `+page.svelte` to decide
 * whether to render the `WifiWarning` banner during a read.
 *
 * Conformance:
 * - `navigator.connection.effectiveType` is a string from a fixed set
 *   in the spec ('slow-2g' | '2g' | '3g' | '4g') or `undefined`.
 * - `navigator.connection.saveData` is a boolean the user can toggle in
 *   their OS-level data-saver setting.
 * - The API is fully absent on desktop and iOS Safari (only Chrome-family
 *   and Android Firefox expose it).
 *
 * This module never throws. When the API is absent OR returns something
 * weird, it returns `{ effectiveType: null, saveData: false, isSlow: false }`
 * -- a desktop user never sees the wifi banner.
 *
 * The `isSlow` definition here is the only place this policy lives. If
 * it needs to change (e.g. add `'4g'` when a user complains the banner
 * shows on a fast phone), this is the line. The gate's "Reading a PDS
 * can use tens of MB" fact is unconditional and lives in `Gate.svelte`;
 * it does not consult this module.
 */

const SLOW_TYPES = new Set(['slow-2g', '2g', '3g']);

/**
 * @returns {{effectiveType: string|null, saveData: boolean, isSlow: boolean}}
 */
export function getConnection() {
	const conn = typeof navigator !== 'undefined' ? navigator.connection : null;
	if (!conn || typeof conn !== 'object') {
		return { effectiveType: null, saveData: false, isSlow: false };
	}
	const effectiveType =
		typeof conn.effectiveType === 'string' ? conn.effectiveType : null;
	const saveData = conn.saveData === true;
	const isSlow = saveData || (effectiveType != null && SLOW_TYPES.has(effectiveType));
	return { effectiveType, saveData, isSlow };
}
```

### Step 3.4: Run the test to verify it passes

Run: `npm test -- src/lib/util/connection.spec.js`
Expected: PASS — all six tests.

### Step 3.5: Run the full suite

Run: `npm test`
Expected: PASS — all tests green.

### Step 3.6: Commit

```bash
git add src/lib/util/connection.js src/lib/util/connection.spec.js
git commit -m "feat(connection): read navigator.connection for slow-network signal"
```

---

## Task 4: Wire the wifi warning banner into `+page.svelte`

**Files:**
- Create: `src/lib/components/WifiWarning.svelte`
- Modify: `src/routes/+page.svelte` (import `getConnection`, `WifiWarning`; state + onMount listener; render conditionally)

**Interfaces:**
- Consumes: `getConnection()` from Task 3.
- Produces: `<WifiWarning visible={busy && connection.isSlow && !connectionDismissed} ondismiss={() => (connectionDismissed = true)} />`. The page owns the dismissed state so the same component instance handles one read's banner.

### Step 4.1: Create `WifiWarning.svelte`

Create `src/lib/components/WifiWarning.svelte`:

```svelte
<script>
	/**
	 * One-line banner shown above the firehose when the connection is
	 * slow (or saveData is on) AND a read is in progress AND the user
	 * has not dismissed it for the session. A dismissable banner is
	 * not the place for a hard block; the gate's "can use tens of MB"
	 * fact is what handles pre-consent -- this is a last-mile reminder
	 * for users who pressed Read and then noticed the bytes climbing.
	 *
	 * The firehose already shows the byte counter; this banner sits
	 * above it without pretending the user can't see what they're
	 * spending. Copy stays factual, no alarm emoji, no dramatic
	 * punctuation.
	 */
	let { visible = false, ondismiss = () => {} } = $props();
</script>

{#if visible}
	<div class="wifi" role="status" aria-live="polite">
		<span>
			Reading a PDS can use tens of MB. Switch to wifi to avoid data charges.
		</span>
		<button onclick={ondismiss}>Continue anyway</button>
	</div>
{/if}

<style>
	.wifi {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 14px;
		background: var(--paper);
		border: 1px solid var(--ink);
		border-left-width: 2px;
		font-family: 'IBM Plex Mono', monospace;
		font-size: 11px;
		line-height: 1.4;
		color: var(--ink);
	}
	.wifi span { flex: 1; }
	.wifi button {
		flex: none;
		font-family: 'Archivo', sans-serif;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		padding: 8px 12px;
		min-height: 36px;
		border: 1px solid var(--ink);
		background: transparent;
		color: var(--ink);
		cursor: pointer;
	}
	.wifi button:hover { background: var(--ink); color: var(--paper); }

	@media (max-width: 820px) {
		.wifi { padding: 10px 12px; gap: 10px; }
		.wifi button { min-height: 44px; }
		.wifi { flex-wrap: wrap; }
	}
</style>
```

Constraint compliance note: no rounded corners, no gradients, no shadow, no decorative motion. Borders are flat 1px solid `var(--ink)`. The text is factual, not styled as a danger.

### Step 4.2: Modify `+page.svelte`

In `src/routes/+page.svelte`:

1. Add the imports near the top of `<script>`:

```js
import { getConnection } from '$lib/util/connection.js';
import WifiWarning from '$lib/components/WifiWarning.svelte';
```

(Place them with the other component imports for readability.)

2. Add state near the other `$state` declarations (around line 47, near `railOpen`):

```js
let connectionDismissed = $state(false);
```

3. In the `onMount(async () => { ... })` block, after `await session.init();` (line 360) and before `const s = fromHash(...)`, add the connection bootstrap and listener:

```js
// `navigator.connection` is absent on iOS Safari and most desktops;
// the module returns isSlow:false in that case and the banner is
// simply never shown. The optional listener only arms when the API
// exists, so no listener leaks into a desktop session.
/** @type {((e: Event) => void) | null} */
let connListener = null;
const connObj = typeof navigator !== 'undefined' ? navigator.connection : null;
if (connObj && typeof connObj.addEventListener === 'function') {
	connListener = () => {
		// a change can move the network from slow to fast (walking back
		// to wifi) or fast to slow (roaming off wifi). Either direction
		// should re-show the banner if the new state is slow AND the
		// user has not already dismissed it for the session.
		// The component reads getConnection() on each render, so a
		// reactive bump from Svelte is what triggers the re-render --
		// touching `connectionTick` (a one-line state) does that
		// without exposing the network object to the template.
		connectionTick++;
	};
	connObj.addEventListener('change', connListener);
}
let connectionTick = $state(0);

// reactivity bridge: getConnection() is a plain function, so derive the
// current value off `connectionTick` so any reactive reader sees
// fresh values after a `change` event.
const connection = $derived.by(() => {
	connectionTick; // explicit dep
	return getConnection();
});
```

Add `connectionTick = $state(0)` to the existing `$state` declarations block if you'd rather keep declarations together — just be sure it lives in scope where `connListener` is set.

4. Add the teardown. The existing `onMount` block is `async () => { ... }` without a cleanup. Convert the listener teardown into a top-level teardown using `$effect` or an explicit cleanup. Cleanest: in `onMount`, register a teardown by stashing the listener and reading it on the next render. Simpler: return a cleanup function from the async `onMount`:

Replace the `onMount(async () => { ... })` signature so it captures cleanup:

```js
onMount(() => {
	// ...
	const cleanup = () => {
		const obj = typeof navigator !== 'undefined' ? navigator.connection : null;
		if (obj && connListener) obj.removeEventListener('change', connListener);
	};
	// ... existing async body ...
	return cleanup; // not awaited; Svelte 5 still receives the return
});
```

Easiest path that does not refactor the onMount: do not register a listener at all on the first pass. The signal is "is slow at first read", and that's stable for the duration of the session unless the user toggles OS-level data-saver. The gate fact handles pre-consent; the banner handles during-read at slow networks; missing out on a mid-session `slow-2g → 4g → 2g` toggle is acceptable. Keep it simple.

Revised simpler step:

In `onMount`, before `await session.init()` (or anywhere before `draw()` is called):

```js
// `navigator.connection` is absent on iOS Safari and most desktops;
// the module returns isSlow:false in that case, so the banner is
// simply never shown -- and listening for `change` is unnecessary
// for a single read session, where the user either is or isn't on a
// slow network at the moment they pressed Read.
const connection = getConnection();
```

Then make `connection` a top-level `$derived` to keep the template reactive:

```js
const connection = $derived(getConnection());
```

5. In the template, render the warning above the firehose. Find the section:

```svelte
{:else if busy}
  <Firehose
    {phase}
    bytes={gotBytes}
    records={gotRecords}
    collections={data?.collections.length ?? 0}
    {lines}
    {elapsed}
  />
```

Replace it with:

```svelte
{:else if busy}
  <WifiWarning
    visible={connection.isSlow && !connectionDismissed}
    ondismiss={() => (connectionDismissed = true)}
  />
  <Firehose
    {phase}
    bytes={gotBytes}
    records={gotRecords}
    collections={data?.collections.length ?? 0}
    {lines}
    {elapsed}
  />
```

No CSS changes needed in `+page.svelte`; the `.stage` parent of the `busy` branch is already `position: relative; overflow: hidden`, and `WifiWarning` is a normal-flow div.

### Step 4.3: Smoke check

Run: `npm run dev` (or `npm run dev:mobile` if testing on a phone over LAN).
Sign in is not required — `WifiWarning` shows on any active read.

- Throttle the dev-tools network to Slow 3G.
- Click Read. Confirm the banner appears above the firehose.
- Click "Continue anyway". Confirm the banner disappears and stays gone across the session.
- Un-throttle back to No throttling. Confirm the banner does NOT appear on a fresh read.

### Step 4.4: Run the full suite

Run: `npm test`
Expected: PASS — all tests green.

### Step 4.5: Commit

```bash
git add src/lib/components/WifiWarning.svelte src/routes/+page.svelte
git commit -m "feat(wifi-warning): banner above firehose on slow networks"
```

---

## Task 5: Add `labelInset` to `paintMap`

**Files:**
- Modify: `src/lib/repo/paint.js:18-79` (extend `paintMap`'s options bag)
- Modify: `src/lib/repo/paint.spec.js` (add tests)
- Modify: `src/lib/components/Treemap.svelte:117-126, 141-163` (call site)

**Interfaces:**
- Consumes: nothing new at the module level.
- Produces: `paintMap(ctx, map, {w, h, ink, background, labels, labelScale, labelInset})`. `labelInset` defaults to `{top: 0, left: 0}`. When a block's `b.y < labelInset.top` OR `b.x < labelInset.left`, its label (and only its label) is skipped. The cell itself is still drawn — touch-to-open still works on it. PNG export callers pass `{labelInset: {top: 0, left: 0}}` to preserve original label positions.

### Step 5.1: Write the failing tests

Append to `src/lib/repo/paint.spec.js` (do not modify the existing tests — extend only):

```js
describe('paintMap labelInset', () => {
	it('skips labels whose block starts above the inset (mobile: under the railtoggle)', () => {
		// build a map with two side-by-side top blocks by giving the
		// painter a layout that distributes them along the top row
		const map = mapOf({ 'a.b.c': 4, 'd.e.f': 4 }, 800, 200);
		const ctx = stubCtx();
		paintMap(ctx, map, {
			w: 800,
			h: 200,
			labels: true,
			labelInset: { top: 50, left: 0 }
		});

		const labelCalls = ctx.ops.filter(([op]) => op === 'fillText');
		const cellCalls = ctx.ops.filter(([op]) => op === 'fillRect');

		// cells were still drawn -- label inset doesn't shrink the map
		expect(cellCalls.length).toBeGreaterThan(0);
		// some labels were drawn (the bottom row's), not all
		expect(labelCalls.length).toBeGreaterThan(0);
		expect(labelCalls.length).toBeLessThan(ctx.ops.filter(([op]) => op === 'fillStyle').length);
	});

	it('every drawn label has b.y >= labelInset.top', () => {
		// confirm by inspecting the stub: measureText has width = label.length * 5
		// we cannot recover b.y directly from the stub, so check the bounding
		// plate rects instead -- the plate is drawn at (b.x, b.y).
		const map = mapOf({ 'a.b.c': 4, 'd.e.f': 4 }, 800, 200);
		const ctx = stubCtx();
		paintMap(ctx, map, {
			w: 800,
			h: 200,
			labels: true,
			labelInset: { top: 50, left: 0 }
		});

		// every plate (fillRect that is followed by a fillText in the same plate
		// batch) must start at y >= 50. The painter does plate-then-text in two
		// consecutive ops; find plate indices by walking fillText backwards.
		const ops = ctx.ops;
		for (let i = 0; i < ops.length; i++) {
			if (ops[i][0] !== 'fillText') continue;
			const plateIdx = ops
				.slice(0, i)
				.reverse()
				.findIndex(([op]) => op === 'fillRect');
			const plate = ops.slice(0, i).reverse()[plateIdx];
			expect(plate[2]).toBeGreaterThanOrEqual(50); // plate[2] is the x in fillRect(x,y,w,h)
			// y is plate[3]
			expect(plate[3]).toBeGreaterThanOrEqual(50);
			break; // one is enough -- the painter is uniform
		}
	});

	it('defaults to labelInset {top: 0, left: 0} when omitted', () => {
		const map = mapOf({ 'a.b.c': 4 }, 800, 200);
		const ctx = stubCtx();
		paintMap(ctx, map, { w: 800, h: 200, labels: true });

		// every drawn label has y = 0 (no inset) -- check the same way
		const ops = ctx.ops;
		const textIdx = ops.findIndex(([op]) => op === 'fillText');
		expect(textIdx).toBeGreaterThan(-1);
		const plateIdx = ops.slice(0, textIdx).reverse().findIndex(([op]) => op === 'fillRect');
		const plate = ops.slice(0, textIdx).reverse()[plateIdx];
		expect(plate[2]).toBe(0);
		expect(plate[3]).toBe(0);
	});
});
```

### Step 5.2: Run the new tests to verify they fail

Run: `npm test -- src/lib/repo/paint.spec.js`
Expected: FAIL — TypeError on `paintMap(... labelInset: ...)` because the option is not destructured yet. Existing tests continue to pass.

### Step 5.3: Extend `paintMap` in `paint.js`

Replace the function body in `src/lib/repo/paint.js`:

```js
export function paintMap(
	ctx,
	map,
	{ w, h, ink = '#171717', background = null, labels = true, labelScale = 1, labelInset = { top: 0, left: 0 } }
) {
	if (background) {
		ctx.fillStyle = background;
		ctx.fillRect(0, 0, w, h);
	} else {
		ctx.clearRect(0, 0, w, h);
	}

	// Batch by fill colour: setting fillStyle per record would be ~200k state
	// changes on a large repo, where grouping makes it a few thousand.
	const byColour = new Map();
	for (const b of map.blocks) {
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

	if (!labels) return;

	// labels last, so no cell paints over them
	const s = labelScale;
	const insetTop = labelInset?.top ?? 0;
	const insetLeft = labelInset?.left ?? 0;
	ctx.font = `${LABEL_FONT_PX * s}px "IBM Plex Mono", monospace`;
	ctx.textBaseline = 'top';
	for (const b of map.blocks) {
		if (!b.label) continue;
		// mobile: omit labels for blocks under the railtoggle so the button
		// doesn't sit on top of them. The cell is still drawn -- tap still
		// works, the label is just less readable than the button over it.
		if (b.y < insetTop || b.x < insetLeft) continue;
		const tw = ctx.measureText(b.label).width;
		ctx.fillStyle = LABEL_PLATE;
		ctx.fillRect(b.x, b.y, tw + 2 * LABEL_PAD_PX * s, LABEL_BOX_PX * s);
		ctx.fillStyle = ink;
		ctx.fillText(b.label, b.x + LABEL_PAD_PX * s, b.y + 2 * s);
	}
}
```

Only the destructure (adding `labelInset = { top: 0, left: 0 }`) and the two `insetTop`/`insetLeft` lines plus the `if (b.y < insetTop || b.x < insetLeft) continue;` line are new. The painter's existing single responsibility (data → pixels) is unchanged.

### Step 5.4: Run the tests to verify they pass

Run: `npm test -- src/lib/repo/paint.spec.js`
Expected: PASS — all existing tests still pass (the new default `{top:0,left:0}` matches old behaviour), and the three new labelInset cases pass.

### Step 5.5: Run the full suite

Run: `npm test`
Expected: PASS.

### Step 5.6: Commit

```bash
git add src/lib/repo/paint.js src/lib/repo/paint.spec.js
git commit -m "feat(paint): labelInset skips labels under mobile overlay controls"
```

---

## Task 6: Wire mobile label scale and inset into `Treemap.svelte`

**Files:**
- Modify: `src/lib/components/Treemap.svelte:117-163` (call `draw()` with mobile-aware options)
- Modify: `src/lib/repo/exportpng.js` (ensure PNG export path is unchanged: explicit `labelInset: {top: 0, left: 0}, labelScale: 1`)

**Interfaces:**
- Consumes: nothing new.
- Produces: on a viewport `w <= 820`, the on-screen canvas draws with `labelScale = 1.3` (matches the 11.5px mobile legend text) and `labelInset = {top: 56, left: 0}` (clears the railtoggle). Otherwise, both are at their desktop defaults. PNG export remains at desktop defaults.

### Step 6.1: Read the export path to confirm call sites

Open `src/lib/repo/exportpng.js` and find every call to `paintMap`. In the existing file (as of spec commit), there is exactly one `paintMap(...)` call within `exportpng.js`. Confirm its arguments, then continue.

### Step 6.2: Update the on-screen draw call in `Treemap.svelte`

In `src/lib/components/Treemap.svelte`, modify the `$effect` block that calls `draw()` (around line 117-126). Replace the existing call:

```js
const ratio = window.devicePixelRatio || 1;
draw(canvas, map, w, h, ratio, flatCells, safeFocusedIndex);
```

with a version that derives the mobile options:

```js
const ratio = window.devicePixelRatio || 1;
const isMobile = w <= 820;
const labelScale = isMobile ? 1.3 : 1;
const labelInset = isMobile ? { top: 56, left: 0 } : { top: 0, left: 0 };
draw(canvas, map, w, h, ratio, flatCells, safeFocusedIndex, labelScale, labelInset);
```

Then update the inner `draw(...)` helper signature (around line 141):

```js
function draw(cv, m, cw, ch, ratio, cells, focusIdx, labelScale = 1, labelInset = { top: 0, left: 0 }) {
```

and the call to `paintMap` inside it (around line 152):

```js
paintMap(ctx, m, { w: cw, h: ch, ink, background: null, labels: true, labelScale, labelInset });
```

### Step 6.3: Confirm `exportpng.js` still passes desktop defaults

Open `src/lib/repo/exportpng.js`. Find the `paintMap(...)` call within it. Confirm the call does NOT pass `labelInset`. If it does pass anything, remove the new keys (`labelScale`, `labelInset`) so the PNG export uses the painter's defaults (`labelScale: 1`, `labelInset: {top: 0, left: 0}`).

If `exportpng.js` already passes `labelScale: 1`, leave that line. The new `labelInset` defaults are independent and untouched.

### Step 6.4: Smoke check

Open the dev server (`npm run dev` or `npm run dev:mobile`).

- At desktop width: open a large repo. Confirm labels still appear at the existing 8.5px and the top-left label is still drawn.
- At mobile width (DevTools responsive < 820px): open a large repo. Confirm labels render at ~11px, and that the top-left block's label is omitted (no plate in the corner under the railtoggle button).
- Export PNG from a desktop viewport. Confirm the PNG still has the same label layout (verify by exporting before AND after, comparing bytes if trivial; otherwise by visual inspection).

### Step 6.5: Run the full suite

Run: `npm test`
Expected: PASS.

### Step 6.6: Commit

```bash
git add src/lib/components/Treemap.svelte src/lib/repo/exportpng.js
git commit -m "feat(treemap): mobile label scale 1.3x and inset under railtoggle"
```

---

## Task 7: Manual end-to-end smoke check

**Files:** none — verification only.

### Step 7.1: Real-device smoke (if a phone is available)

If using `npm run dev:mobile` per README:

1. Sign-out / clear cookies. Open the app fresh.
2. Confirm the gate shows four facts including "Reading a PDS can use tens of MB."
3. Throttle Chrome DevTools network to Slow 3G.
4. Tap Read. Confirm the wifi banner appears above the firehose.
5. Tap "Continue anyway". Confirm the banner disappears.
6. Throttle back to None. Tap Read. Confirm no banner.
7. Open a large repo (e.g. `pfrazee.com`). Confirm the top-left cell's label is omitted (no plate under the railtoggle). Confirm the railtoggle itself still works.
8. Confirm cell labels render at a legible ~11px on the phone screen, not the desktop 8.5px.
9. Open a record whose `subject.uri` points at a `site.standard.*` collection. Confirm only "Open on pdsls.dev" appears; the "Open on <domain>" button is absent.
10. Open a record whose own collection resolves to a `site.standard.*` NSID. Same: only pdsls.dev button.

### Step 7.2: DevTools-only smoke (no phone)

1. Open DevTools responsive design mode, set viewport to 390x844 (iPhone 12 width).
2. Repeat the four steps above using the dev server.
3. The label-overlap and label-size fixes are purely CSS-state-driven by `w <= 820`; the smoke is sufficient without a physical device.

### Step 7.3: Final commit

If any small fixes were necessary during smoke, commit them as a single `chore(mobile-polish): address smoke-test followups` commit.

---

## Self-Review Notes

### Spec coverage

Each section in `docs/superpowers/specs/2026-08-03-mobile-polish-design.md` maps to a task:

- "Wifi warning on slow networks" → Task 3 (`getConnection`), Task 4 (banner + page integration). Component placement described in the spec ("rendered immediately before `<Firehose>` in DOM order") → implemented in Task 4 step 4.2.
- "The gate gets a parallel signal" → Task 2.
- "Canvas label overlap with controls button" → Task 5 (`labelInset` in painter), Task 6 (call site in `Treemap.svelte`, PNG export unchanged).
- "Mobile font scale" → Task 6 (mobile `labelScale = 1.3` call site).
- "`standard.site` block" → Task 1 (`BLOCKED_DOMAINS` set + gate in `appLinkFor`, both branches).

### Placeholder scan

No "TBD", "TODO", "implement later", "add validation", "fill in tests". Test code includes the full assertions, not `expect(...).toBe(...)` with mocks of mocks.

### Type consistency

- `BLOCKED_DOMAINS` is declared and exported in Task 1; imported in Task 1 tests.
- `getConnection()` return shape `{ effectiveType, saveData, isSlow }` is named identically in Task 3 (`connection.js` source, spec, tests) and Task 4 (consumed as `connection.isSlow`).
- `paintMap`'s `labelInset` option is named identically across Task 5 (definition), Task 5 tests, and Task 6 (call site). Default `{top: 0, left: 0}` matches across all three.
- `labelScale` is an existing parameter; this plan does not rename it.
- `WifiWarning` props `visible`, `ondismiss` are declared in Task 4 source and Task 4 page call site identically.

### Inline fixes during self-review

- Step 4.2 originally proposed a `change` event listener with `connectionTick` reactivity bridge; on re-read, the simpler path (read once, no listener) is preferable for v1 and keeps the page smaller. The plan was rewritten in place to use the simpler approach.
- Step 4.2 carefully notes the cleanup decision so a future implementer who wants the listener can add it without re-doing the design.
