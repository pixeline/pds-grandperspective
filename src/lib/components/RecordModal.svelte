<script>
	import {
		validateEdit,
		putRecord,
		deleteRecord,
		guardedWrite,
		ALREADY_IN_FLIGHT_REASON
	} from '$lib/atproto/write.js';
	import { fmtBytes, fmtDate } from '$lib/repo/format.js';
	import { tidToMs } from '$lib/atproto/tid.js';
	import { appLinkFor } from '$lib/repo/appOf.js';
	import { MICROBLOGGING_MAP, VIEWER_MAP } from '$lib/preferences.js';
	import { SvelteSet } from 'svelte/reactivity';

	/** @type {{record: import('$lib/repo/types.js').ModalRecord | null, did: string | null,
	 *          handle: string | null, agent: any, canWrite: boolean, isOwnRepo: boolean,
	 *          onclose?: () => void, onchanged?: (e: {action: 'updated'|'deleted', record: any, value?: any}) => void,
	 *          microblogging?: string, viewer?: string}} */
	let {
		record = null,
		did = null,
		handle = null,
		agent = null,
		canWrite = false,
		isOwnRepo = false,
		onclose,
		onchanged,
		microblogging = $bindable('bsky'),
		viewer = $bindable('pdsls.dev')
	} = $props();

	let editing = $state(false);
	let confirming = $state(false);
	let text = $state('');
	/** @type {string|null} */
	let problem = $state(null);
	let busy = $state(false);

	// Instance state (confirming/editing/text/problem/busy) belongs to
	// whichever record last touched it. Task 18 mounts this modal once and
	// swaps the `record` prop rather than destroying the instance between
	// records, so nothing here resets on its own. `keyOf` is the one
	// definition of "same record" shared by this effect and by the
	// post-await checks in save()/remove() below -- it must stay a single
	// function rather than three copies of the string concatenation.
	/** @param {any} r */
	function keyOf(r) {
		return r ? `${r.col}/${r.rkey}` : null;
	}

	// Track the record's identity in a plain (non-reactive) variable and
	// reset per-record state whenever it changes -- including transitions to
	// and from null, which is what makes closing the modal (by any path)
	// also clear a stale `confirming`/`editing`. Without this, confirming a
	// delete on record A and then opening record B lands straight on
	// "Confirm delete" for B, and an in-progress edit of A leaves A's text
	// sitting in the textarea under B's header.
	//
	// `busy` is reset here too: it describes whether *the record now on
	// screen* has a write in flight, not whether this component instance
	// ever kicked one off. A's write finishing is not B's concern, and
	// waiting for it to settle before B's controls unstick would leave B
	// stuck for no reason B caused. A's own in-flight request is unaffected
	// by this reset -- it keeps running against the `target` it captured in
	// save()/remove(), and its post-await code below independently checks
	// whether it is still looking at the record it started on before
	// touching any of this shared display state again.
	/** @type {string|null} */
	let lastKey = null;
	$effect(() => {
		const key = keyOf(record);
		if (key === lastKey) return;
		lastKey = key;
		confirming = false;
		editing = false;
		text = '';
		problem = null;
		busy = false;
	});

	// `busy` is a *display* flag -- is the record currently on screen
	// mid-write -- and resetting it on identity change is correct for that
	// job alone. It used to incidentally be the only thing stopping a
	// second concurrent write on the same record, but that is concurrency
	// control, a different job, keyed to the record rather than to what
	// happens to be on screen: switch from A to B and back to A while A's
	// delete is still in flight, and the identity effect above resets
	// `busy` to `false` twice for a request that never stopped running --
	// nothing about display state can tell you a request is still out
	// there. `inFlight` (paired with `guardedWrite` from write.js, which is
	// the actual concurrency guard, independently tested there) tracks that
	// instead, by key, and is never touched by the identity effect.
	// `SvelteSet` (not a plain `Set`) so the `writeInFlight` derived below
	// can react to `.add`/`.delete` -- a plain `Set` mutated in place would
	// not notify Svelte's reactivity and the Edit/Delete buttons below would
	// not visibly disable.
	const inFlight = new SvelteSet();

	// Whether the record currently on screen has a write outstanding
	// somewhere, even if `busy` (this component's own recollection of that)
	// has since been reset by a trip to another record and back. Cheap to
	// derive because `inFlight` is already reactive; used only to disable
	// Edit/Delete and explain why, not to gate save()/remove() themselves --
	// the guard inside those functions is the actual concurrency control and
	// does not depend on this derived being up to date.
	const writeInFlight = $derived(record ? inFlight.has(keyOf(record)) : false);

	const writable = $derived(isOwnRepo && canWrite && !!agent && !record?.aggregate);

	// An aggregate's `rkey` is always null (see types.js), so this is null for
	// an aggregate too -- no tid time is shown for a block with no single
	// record behind it.
	const tidTime = $derived(record?.rkey ? tidToMs(record.rkey) : null);
	// `value` only exists on the non-aggregate half of ModalRecord --
	// `record?.value` doesn't narrow that away, so check `aggregate` first
	const claimed = $derived.by(() => {
		if (!record || record.aggregate) return null;
		return record.value?.createdAt ? Date.parse(record.value.createdAt) : null;
	});
	// the TID is server-assigned, createdAt is user-claimed; a disagreement is
	// information, not noise, so it is shown rather than resolved away
	const skewed = $derived(
		tidTime != null && claimed != null && Math.abs(tidTime - claimed) > 864e5
	);

	// An aggregate already gets its "too small to resolve" explanation from the
	// `.note` paragraph in the template below -- saying it again here would be
	// the exact contradiction this fix is for (two statements where one would
	// do), so an aggregate contributes nothing to the read-only footer text.
	const readOnlyReason = $derived(
		record?.aggregate
			? null
			: !agent
				? 'Sign in to edit your own records.'
				: !isOwnRepo
					? 'You can only edit records in your own repository.'
					: !canWrite
						? 'No write access granted.'
						: null
	);

	function startEdit() {
		// Edit is only ever rendered for a writable, non-aggregate record (see
		// `writable` above), but that guard lives in the template -- narrow it
		// here too, both for null-safety and so `record.value` (required only
		// on the non-aggregate half of ModalRecord) typechecks.
		if (!record || record.aggregate) return;
		text = JSON.stringify(record.value, null, 2);
		problem = null;
		editing = true;
	}

	async function save() {
		// Capture the record this write is about at the moment it starts. The
		// write is async; `record` is a live prop that can change under us
		// while the request is in flight (the parent can select a different
		// cell), so every reference below must use this local, not the prop.
		const target = record;
		if (!target || target.aggregate || !did) return;
		const key = keyOf(target);
		const check = validateEdit(target.value, text);
		if (!check.ok) {
			problem = check.reason;
			return;
		}
		try {
			// guardedWrite is the actual concurrency control (independently
			// tested in write.spec.js): `busy`/`problem` only get set inside
			// the callback below, which it only invokes if `key` doesn't
			// already have a write running -- a trip to another record and
			// back can reset the *display* flag `busy` (see the identity
			// effect above) while this exact write is still outstanding, so
			// `busy` alone cannot be trusted to say so.
			const outcome = await guardedWrite(inFlight, key, async () => {
				busy = true;
				problem = null;
				await putRecord(agent, { did, col: target.col, rkey: target.rkey, value: check.value });
			});
			if (!outcome.ok) {
				if (keyOf(target) === keyOf(record)) problem = outcome.reason;
				return;
			}
			onchanged?.({ action: 'updated', record: target, value: check.value });
			// The write is pinned to `target`, but busy/editing are still
			// shared display state. Only touch them if the modal is still
			// showing the record this write was about -- otherwise it
			// completes silently (onchanged has already fired with the
			// pinned target) and whatever is now on screen is left alone.
			if (keyOf(target) === keyOf(record)) {
				editing = false;
				busy = false;
			}
		} catch (/** @type {any} */ e) {
			if (keyOf(target) === keyOf(record)) {
				// surface the XRPC error verbatim and leave local state untouched
				problem = String(e?.message ?? e);
				busy = false;
			}
		}
	}

	async function remove() {
		// Same reasoning as save(): pin the record this delete targets before
		// awaiting, so a mid-flight selection change can't misattribute the
		// result to whatever happens to be selected when the response lands.
		const target = record;
		if (!target || target.aggregate || !did) return;
		const key = keyOf(target);
		try {
			const outcome = await guardedWrite(inFlight, key, async () => {
				busy = true;
				problem = null;
				await deleteRecord(agent, { did, col: target.col, rkey: target.rkey });
			});
			if (!outcome.ok) {
				if (keyOf(target) === keyOf(record)) problem = outcome.reason;
				return;
			}
			onchanged?.({ action: 'deleted', record: target });
			// Only close (and only clear busy) if the modal is still showing
			// the record that was just deleted. If the parent moved on to a
			// different record while this delete was in flight, closing now
			// would yank that other record's modal out from under the user.
			if (keyOf(target) === keyOf(record)) {
				busy = false;
				onclose?.();
			}
		} catch (/** @type {any} */ e) {
			if (keyOf(target) === keyOf(record)) {
				problem = String(e?.message ?? e);
				confirming = false;
				busy = false;
			}
		}
	}

	function openExternal(url) {
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

	const viewerLink = $derived.by(() => {
		if (!record || !did) return null;
		const choice = VIEWER_MAP[viewer] ?? VIEWER_MAP['pdsls.dev'];
		const path = record.aggregate ? `${did}/${record.col}` : `${did}/${record.col}/${record.rkey}`;
		if (choice.domain === 'aturi.to') {
			return {
				...choice,
				url: `https://aturi.to/explore/${path}`
			};
		}
		return {
			...choice,
			url: `https://pdsls.dev/at://${path}`
		};
	});

	// The app that owns this record's lexicon, and the best URL to open on it
	// (deep link for the four documented Bluesky shapes, domain root
	// otherwise) -- or, when the record's value carries a `subject.uri` (a
	// like or repost pointing at the post it's about), the link is resolved
	// from THAT subject instead, so the button opens what the record is
	// about rather than a home page.
	//
	// If a microblogging preference is set and the record's collection is a
	// Bluesky collection (app.bsky.*), override the domain with the preferred
	// microblogging app.
	//
	// An aggregate block has no single record behind it, so this button is
	// dropped entirely rather than shown pointing at a domain root -- for a
	// collection like app.bsky.feed.like that would be "Open on bsky.app"
	// landing on a home feed, which is not what "open on the app" promises
	// for a whole collection. `null` here (not "compute it anyway with no
	// rkey/value") is what makes the button vanish below.
	const appLink = $derived.by(() => {
		const base = record && !record.aggregate ? appLinkFor(record.col, did, record.rkey, record.value) : null;
		if (!base) return null;
		
		// Override with preferred microblogging app if this is a Bluesky collection
		const preferred = MICROBLOGGING_MAP[microblogging];
		if (preferred && base.domain === 'bsky.app') {
			const subject = record?.value?.subject;
			const subjectUri =
				typeof subject === 'string'
					? subject
					: subject && typeof subject === 'object' && typeof subject.uri === 'string'
						? subject.uri
						: null;
			const atUri =
				typeof subjectUri === 'string' && subjectUri.startsWith('at://')
					? subjectUri
					: record?.rkey
						? `at://${did}/${record.col}/${record.rkey}`
						: null;

			if (preferred.route === 'at-uri-path' && atUri) {
				return {
					...base,
					domain: preferred.domain,
					label: preferred.label,
					url: `https://${preferred.domain}/${atUri}`
				};
			}
			return {
				...base,
				domain: preferred.domain,
				label: preferred.label,
				url: base.url.replace('bsky.app', preferred.domain)
			};
		}
		return base;
	});

	/** @param {string} domain */
	function iconSourcesFor(domain) {
		return [
			`https://${domain}/favicon.ico`,
			// Fallback only, tried after the direct favicon fails or 404s.
			// Requesting an icon from DuckDuckGo tells DuckDuckGo which app's
			// records this user is inspecting -- a third party this tool
			// otherwise avoids entirely (see README). Direct-first keeps 59%
			// of lookups from ever reaching a third party at all; this
			// fallback is what takes total icon coverage from 59% to 70%,
			// which the owner judged worth that cost. Not an oversight.
			`https://icons.duckduckgo.com/ip3/${domain}.ico`
		];
	}

	// Which candidate (0 = direct, 1 = DuckDuckGo, past the end = give up) is
	// currently shown, and whether both have failed. Reset per domain, not
	// per record: switching between two records on the same app should not
	// re-show an icon that already proved unreachable this session.
	let viewerIconSrcIndex = $state(0);
	let viewerIconGaveUp = $state(false);
	/** @type {string|null} */
	let lastViewerIconDomain = null;
	$effect(() => {
		const domain = viewerLink?.domain ?? null;
		if (domain === lastViewerIconDomain) return;
		lastViewerIconDomain = domain;
		viewerIconSrcIndex = 0;
		viewerIconGaveUp = false;
	});

	const viewerIconSrc = $derived(
		viewerLink && !viewerIconGaveUp ? iconSourcesFor(viewerLink.domain)[viewerIconSrcIndex] : null
	);

	function viewerIconError() {
		if (!viewerLink) return;
		if (viewerIconSrcIndex < iconSourcesFor(viewerLink.domain).length - 1) {
			viewerIconSrcIndex += 1;
		} else {
			viewerIconGaveUp = true;
		}
	}

	let appIconSrcIndex = $state(0);
	let appIconGaveUp = $state(false);
	/** @type {string|null} */
	let lastAppIconDomain = null;
	$effect(() => {
		const domain = appLink?.domain ?? null;
		if (domain === lastAppIconDomain) return;
		lastAppIconDomain = domain;
		appIconSrcIndex = 0;
		appIconGaveUp = false;
	});

	const appIconSrc = $derived(
		appLink && !appIconGaveUp ? iconSourcesFor(appLink.domain)[appIconSrcIndex] : null
	);

	function appIconError() {
		if (!appLink) return;
		if (appIconSrcIndex < iconSourcesFor(appLink.domain).length - 1) {
			appIconSrcIndex += 1;
		} else {
			// both candidates failed -- hide the image entirely rather than
			// leave a broken-image glyph; the button stays fully usable as text
			appIconGaveUp = true;
		}
	}

	function openViewer() {
		if (!viewerLink) return;
		openExternal(viewerLink.url);
	}

	function openApp() {
		if (!appLink) return;
		openExternal(appLink.url);
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && !busy && onclose?.()} />

{#if record}
	<div
		class="scrim"
		role="button"
		tabindex="-1"
		aria-label="Close"
		onclick={() => !busy && onclose?.()}
		onkeydown={(e) => e.key === 'Enter' && !busy && onclose?.()}
	></div>

	<div
		class="modal"
		role="dialog"
		aria-modal="true"
		aria-label={record.aggregate ? `Collection ${record.col}` : `Record ${record.rkey}`}
	>
		<header>
			<h2>{record.col}</h2>
			<button class="x" onclick={() => onclose?.()} aria-label="Close" disabled={busy}>close</button>
		</header>

		<dl class="meta">
			<!-- This is where the owner's confusion actually happened: a record
			     from someone else's repository, with nothing on screen saying
			     so. Name the repository here, from `did`/`handle` props that
			     come from the read result, not from whatever happens to be
			     typed in the handle field. -->
			<div>
				<dt>repo</dt>
				<dd title={did}>{handle ?? did ?? '—'}{#if isOwnRepo} <b class="you">(you)</b>{/if}</dd>
			</div>
			<!-- An aggregate has no single record behind it -- no rkey, no tid
			     time, no per-record stored size to name. Showing those next to a
			     sentence saying "no single record is being shown" is exactly the
			     self-contradiction this fixes, so they are omitted outright
			     rather than filled with a placeholder. The collection is already
			     named in the header above; count and total bytes are stated once,
			     in the `.note` paragraph below -- not duplicated here. -->
			{#if !record.aggregate}
				<div><dt>rkey</dt><dd>{record.rkey ?? '—'}</dd></div>
				<div><dt>stored</dt><dd>{fmtBytes(record.bytes ?? 0)}</dd></div>
			{/if}
			{#if tidTime != null}
				<div><dt>tid time</dt><dd>{fmtDate(tidTime)}</dd></div>
			{/if}
			{#if claimed != null}
				<div class:skew={skewed}>
					<dt>createdAt</dt>
					<dd>{fmtDate(claimed)}{skewed ? ' — disagrees with the TID' : ''}</dd>
				</div>
			{/if}
			{#if !record.aggregate && record.err}
				<div><dt>errors</dt><dd>{record.err}</dd></div>
			{/if}
		</dl>

		{#if record.aggregate}
			<p class="note">
				{record.records} records, {fmtBytes(record.bytes)}. Cells would be under a pixel, so
				the block is drawn whole — no single record shown.
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
			{#if viewerLink}
				<button class="ghost app-link" onclick={openViewer} title={`Open in ${viewerLink.label} (${viewerLink.domain})`}>
					{#if viewerIconSrc}
						<img class="app-icon" src={viewerIconSrc} alt="" aria-hidden="true" onerror={viewerIconError} />
					{/if}
					Examine
				</button>
			{/if}

			{#if appLink}
				<button
					class="ghost app-link"
					onclick={openApp}
					title={appLink.subject
						? `Open linked record in ${appLink.label || appLink.domain}`
						: `Open in ${appLink.label || appLink.domain}`}
				>
					{#if appIconSrc}
						<img class="app-icon" src={appIconSrc} alt="" aria-hidden="true" onerror={appIconError} />
					{/if}
					{appLink.subject ? 'View linked' : 'View'}
				</button>
			{/if}

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
					<button onclick={startEdit} disabled={writeInFlight}>Edit</button>
					<button class="ghost" onclick={() => (confirming = true)} disabled={writeInFlight}>
						Delete
					</button>
					{#if writeInFlight}
						<span class="ro">{ALREADY_IN_FLIGHT_REASON}</span>
					{/if}
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
		/* dvh: on a phone `100vh` is the large viewport, the one that pretends
		   the URL bar is hidden, so the sheet was taller than what is actually
		   on screen. */
		max-height: calc(100dvh - 64px);
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
	.you { font-weight: 700; }
	.skew dd { font-weight: 500; }
	pre, textarea {
		margin: 0;
		/* 220px is what this pane WANTS, not a floor it holds against the
		   modal's max-height. As `min-height` it could not shrink, so on any
		   viewport shorter than about 470px -- a phone in landscape, a short
		   desktop window -- the sheet grew past `max-height` and pushed the
		   footer, which carries Save and Confirm delete, off the bottom of the
		   screen with nothing scrollable to reach it. Measured at 844x390: the
		   footer's bottom edge landed at 405px. As a flex basis with
		   `min-height: 0` it grows into spare room and yields when there is
		   none, at every size, with no breakpoint involved. */
		flex: 1 1 220px;
		min-height: 0;
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
	button.app-link { display: inline-flex; align-items: center; gap: 6px; }
	.app-icon { width: 16px; height: 16px; border-radius: 0; box-shadow: none; object-fit: contain; }
	button.danger { background: var(--paper); color: var(--ink); border-width: 2px; }
	button:disabled { opacity: 0.35; cursor: default; }
	.x { background: transparent; color: var(--ink-soft); border: 0; padding: 4px; }

	@media (max-width: 820px) {
		/* A full sheet, not a centred card. `calc(100vw - 48px)` leaves 342px on
		   a 390px phone for a record whose JSON is the point of opening it, and
		   `100vh` on iOS means the large viewport, so the footer -- which holds
		   Save, Confirm delete and Keep -- sat under the URL bar with nothing
		   scrollable to reach it. */
		.modal {
			left: 0;
			right: 0;
			top: 0;
			bottom: 0;
			transform: none;
			width: 100%;
			max-height: none;
			gap: 12px;
			padding: 14px max(14px, env(safe-area-inset-right)) calc(14px + env(safe-area-inset-bottom))
				max(14px, env(safe-area-inset-left));
			padding-top: max(14px, env(safe-area-inset-top));
		}
		footer button { min-height: 44px; }
		.x { min-height: 44px; padding: 4px 10px; }
	}
</style>
