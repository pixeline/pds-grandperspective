<script>
	import { onDestroy } from 'svelte';
	import Typeahead from './Typeahead.svelte';
	import Footer from './Footer.svelte';
	import Preferences from './Preferences.svelte';
	import PolarProfile from './PolarProfile.svelte';
	import ProfileCard from './ProfileCard.svelte';
	import { fmtBytes, fmtNum, fmtPct } from '$lib/repo/format.js';
	import { appFilterOptions } from '$lib/repo/waypoints.js';

	let {
		handle = $bindable(''),
		filters = $bindable({ hidden: new Set(), only: new Set(), from: null, to: null, query: '' }),
		busy = false,
		status = 'idle',
		stats = null,
		legend = [],
		errors = [],
		// The collection auto-hidden at the end of the last read, and its share
		// of that read's bytes -- or null. Passed from +page.svelte, which owns
		// the one-shot decision; Rail only has to say it out loud, unmissably,
		// next to the control that undoes it. This project exists because a
		// previous version silently showed a partial picture -- hiding a
		// collection by default is only honest if this cannot be missed, so it
		// is a standing line of text here, not a tooltip or a dimmed label.
		autoHidden = null,
		hueOf,
		vector = null,
		avatar = null,
		displayName = null,
		session = null,
		// Narrow viewports only: below the breakpoint at the bottom of this
		// file the rail stops being a column of the layout and becomes an
		// overlay drawer, because a phone cannot afford to give it a third of
		// the screen -- see the note on the media query. `open` is ignored at
		// desktop widths, where the rail is always present.
		open = false,
		ondraw,
		onstop,
		onsignin,
		onsignout,
		onclose
	} = $props();

	const isoDay = (ms) => (ms == null ? '' : new Date(ms).toISOString().slice(0, 10));

	function setDate(key, value) {
		const ms = value ? Date.parse(`${value}T00:00:00Z`) : null;
		filters = { ...filters, [key]: Number.isFinite(ms) ? ms : null };
	}

	function toggleCollection(nsid) {
		const next = new Set(filters.hidden);
		if (next.has(nsid)) next.delete(nsid);
		else next.add(nsid);
		filters = { ...filters, hidden: next };
	}

	// Hides every OTHER collection currently in the legend, expressed through
	// the same `hidden` exclude-set rather than a second mental model -- "only"
	// is just "hide everything but this one".
	function onlyCollection(col) {
		const next = new Set(legend.map(([c]) => c).filter((c) => c !== col));
		filters = { ...filters, hidden: next };
	}

	function showAll() {
		filters = { ...filters, hidden: new Set() };
	}

	// App filter: the namespaces present in this repo that a catalog app claims
	// (e.g. Tangled, Popfeed, Bluesky). Selecting some restricts the treemap to
	// their collections via `filters.only`. Derived from the legend, which is
	// the set of collections in the current read.
	const appOptions = $derived(appFilterOptions(legend.map(([c]) => c)));

	/** @param {string} prefix */
	function toggleApp(prefix) {
		const next = new Set(filters.only ?? []);
		if (next.has(prefix)) next.delete(prefix);
		else next.add(prefix);
		filters = { ...filters, only: next };
	}

	const hasActiveFilters = $derived(
		filters.hidden.size > 0 ||
			(filters.only?.size ?? 0) > 0 ||
			filters.from != null ||
			filters.to != null ||
			filters.query.trim() !== ''
	);

	function clearFilters() {
		queryInput = '';
		filters = { ...filters, hidden: new Set(), only: new Set(), from: null, to: null, query: '' };
	}

	// Search costs over a second end-to-end on a large repository, so the input
	// is debounced: the visible field updates immediately (bound to a local
	// value) but `filters.query` -- and therefore the refilter -- only changes
	// 500ms after typing stops. Date inputs are NOT debounced; they fire once,
	// on change, not per keystroke.
	// Initialised once from the incoming filters (Rail only mounts once the
	// repo view is entered, by which point a hash-restored query is already in
	// `filters`). Afterward this local value is owned by Rail: the only writes
	// to `filters.query` happen from here (debounce below) or from
	// `clearFilters()`, both of which keep `queryInput` in sync explicitly --
	// so there is no external race to resync against, and no risk of an
	// unrelated filter change (e.g. a legend toggle) clobbering text the user
	// is mid-typing.
	let queryInput = $state(filters.query);
	/** @type {ReturnType<typeof setTimeout> | null} */
	let queryTimer = null;

	function onQueryInput(e) {
		queryInput = e.currentTarget.value;
		clearTimeout(queryTimer ?? undefined);
		queryTimer = setTimeout(() => {
			filters = { ...filters, query: queryInput };
		}, 500);
	}

	onDestroy(() => clearTimeout(queryTimer ?? undefined));
</script>

<aside id="rail" class="rail" class:open>
	<div class="head">
		<h1>GrandPerspective<small>PDS EXPLORER</small></h1>
		<!-- Only reachable when the rail is a drawer; hidden by CSS above the
		     breakpoint, where the rail is a permanent column with nothing to
		     close. -->
		<button class="shut" onclick={() => onclose?.()} aria-label="Close controls">close</button>
	</div>

	<div class="grp">
		<span class="lbl">Repository</span>
		<!-- a sign-in error describes a past attempt; editing the handle makes it
		     stale, so drop it as soon as the user starts typing again -->
		<Typeahead
			bind:value={handle}
			onsubmit={(h) => ondraw(h)}
			oninput={() => session?.clearError?.()}
		/>
		<div class="row">
			<button onclick={() => (busy ? onstop() : ondraw())}>{busy ? 'Stop' : 'Read'}</button>
			{#if session?.did}
				<button class="ghost" onclick={() => onsignout()}>Sign out</button>
			{:else}
				<button class="ghost" onclick={() => onsignin(handle)}>Sign in</button>
			{/if}
		</div>
		{#if session?.did}
			<p class="note">signed in as <b>{session.handle}</b></p>
			{#if !session.canWrite}
				<p class="note warn">No write access granted. Editing disabled.</p>
			{/if}
		{/if}
		{#if session?.error}
			<p class="note warn">{session.error}</p>
		{/if}
	</div>

	<ProfileCard {avatar} name={displayName} />
	{#if vector}
		<PolarProfile {vector} />
	{/if}

	<hr />

	<details class="fold">
		<summary class="fold-summary">Preferences</summary>
		<Preferences />
	</details>

	<hr />

	<div class="grp">
		<span class="lbl">Filter</span>
		<input
			class="txt"
			type="search"
			placeholder="search record content"
			value={queryInput}
			oninput={onQueryInput}
		/>
		<div class="row dates">
			<label class="dt">
				<span>from</span>
				<div class="dtrow">
					<input
						type="date"
						value={isoDay(filters.from)}
						onchange={(e) => setDate('from', e.currentTarget.value)}
					/>
					{#if filters.from != null}
						<button class="clr" onclick={() => setDate('from', '')} aria-label="clear from date"
							>&times;</button
						>
					{/if}
				</div>
			</label>
			<label class="dt">
				<span>to</span>
				<div class="dtrow">
					<input
						type="date"
						value={isoDay(filters.to)}
						onchange={(e) => setDate('to', e.currentTarget.value)}
					/>
					{#if filters.to != null}
						<button class="clr" onclick={() => setDate('to', '')} aria-label="clear to date"
							>&times;</button
						>
					{/if}
				</div>
			</label>
		</div>
		{#if appOptions.length}
			<div class="apps">
				<span class="apps-lbl">Show only these apps</span>
				<div class="chips">
					{#each appOptions as opt (opt.prefix)}
						<button
							type="button"
							class="chip"
							class:on={filters.only?.has(opt.prefix)}
							aria-pressed={filters.only?.has(opt.prefix) ?? false}
							onclick={() => toggleApp(opt.prefix)}
							title={`${opt.label} — ${opt.collections.length} collection${opt.collections.length === 1 ? '' : 's'} (${opt.prefix}.*)`}
						>
							{opt.label}
						</button>
					{/each}
				</div>
			</div>
		{/if}
		{#if hasActiveFilters}
			<button class="ghost sm" onclick={clearFilters}>Clear filters</button>
		{/if}
	</div>

	<hr />

	<details class="fold">
		<summary class="fold-summary">Measured</summary>
		<div class="grp">
			<table>
				<tbody>
					<tr><td class="k">status</td><td class="v">{status}</td></tr>
					{#if stats}
						<!-- Stated from the read result (stats.did/stats.handle), never
						     from the handle input field above -- that field says what to
						     read next, not what is on screen, and the two can silently
						     disagree the moment it is edited without pressing Read. -->
						<tr>
							<td class="k">identity</td>
							<td class="v idval" title={stats.handle ? null : stats.did}>
								{stats.handle ?? stats.did}{#if stats.isOwn}
									<b class="you">(you)</b>
								{/if}
							</td>
						</tr>
						{#if stats.handle}
							<tr>
								<td class="k">did</td>
								<td class="v idval" title={stats.did}>{stats.did}</td>
							</tr>
						{/if}
						<tr><td class="k">pds</td><td class="v">{stats.pds}</td></tr>
						<tr><td class="k">collections</td><td class="v">{stats.collections}</td></tr>
						<tr><td class="k">records</td><td class="v">{fmtNum(stats.records)}</td></tr>
						<tr><td class="k">stored size</td><td class="v">{fmtBytes(stats.bytes)}</td></tr>
						<tr>
							<td class="k">sizes</td>
							<td class="v">
								{stats.source === 'car' ? 'measured (CAR)' : 'estimated (listRecords)'}{#if stats.editedCount}
									· {stats.editedCount} record{stats.editedCount > 1 ? 's' : ''} edited
								{/if}
							</td>
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
	</details>

	<div class="grp">
		<div class="legend-head">
			<span class="lbl">Hue = collection</span>
			{#if filters.hidden.size}
				<button class="ghost sm" onclick={showAll}>Show all</button>
			{/if}
		</div>
		{#if autoHidden}
			<!-- Unmissable, on purpose: naming the collection and its exact share
			     right next to "Show all" is what makes hiding 89% of a repo by
			     default an honest default rather than the silent partial picture
			     this project exists to replace. -->
			<p class="note warn autohide">
				<b>{autoHidden.col}</b> — {fmtPct(autoHidden.share)} of bytes — hidden automatically
			</p>
		{/if}
		<div class="legend">
			{#if legend.length}
				{#each legend as [col, n] (col)}
					{@const isHidden = filters.hidden.has(col)}
					<div class="leg" class:hidden={isHidden}>
						<button
							class="leg-main"
							onclick={() => toggleCollection(col)}
							title="{col} — click to {isHidden ? 'show' : 'hide'}"
						>
							<i
								class="swatch"
								class:hollow={isHidden}
								style="--hue:{hueOf.get(col)}"
								aria-hidden="true"
							></i>
							<span>{col}</span>
							<b>{fmtNum(n)}</b>
						</button>
						<button class="only" onclick={() => onlyCollection(col)} title="show only {col}">
							only
						</button>
					</div>
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
				<p class="note">No invalid records.</p>
			{:else}
				<p class="note">Nothing read yet.</p>
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
	.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
	.shut { display: none; }
	.fold {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.fold-summary {
		font-family: 'Inter', sans-serif;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		cursor: pointer;
		color: var(--ink);
		user-select: none;
	}
	.fold-summary::marker {
		color: var(--ink-soft);
	}
	h1 { font-size: 15px; font-weight: 800; letter-spacing: -0.03em; text-transform: uppercase; margin: 0; line-height: 1.05; }
	h1 small { display: block; font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; color: var(--ink-soft); margin-top: 5px; }
	.grp { display: flex; flex-direction: column; gap: 8px; }
	.lbl { font-size: 9px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink-soft); }
	button {
		font-family: 'Inter', sans-serif;
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
		font-family: 'JetBrains Mono', monospace;
		font-size: 11px;
		padding: 8px;
		border: 1px solid var(--rule);
		background: var(--ground);
		color: var(--ink);
		width: 100%;
	}
	.dt { display: flex; flex-direction: column; gap: 3px; }
	.dt span { font-size: 8.5px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-soft); }
	.dtrow { display: flex; align-items: stretch; gap: 3px; }
	.dtrow input {
		font-family: 'JetBrains Mono', monospace;
		font-size: 10.5px;
		padding: 6px;
		border: 1px solid var(--rule);
		background: var(--ground);
		color: var(--ink);
		width: 100%;
		flex: 1;
	}
	.clr {
		flex: none;
		width: 22px;
		padding: 0;
		font-size: 12px;
		line-height: 1;
		background: transparent;
		color: var(--ink-soft);
		border: 1px solid var(--rule);
	}
	.clr:hover { color: var(--ink); border-color: var(--ink); }

	/* App filter: flat toggle chips. No radius/shadow/gradient (style.spec.js). */
	.apps { margin-top: 8px; }
	.apps-lbl {
		display: block;
		font-size: 10px;
		color: var(--ink-soft);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin-bottom: 4px;
	}
	.chips { display: flex; flex-wrap: wrap; gap: 4px; }
	.chip {
		font-family: 'JetBrains Mono', monospace;
		font-size: 10px;
		padding: 3px 7px;
		border: 1px solid var(--rule);
		background: var(--paper);
		color: var(--ink);
		cursor: pointer;
	}
	.chip:hover { background: var(--ground); }
	.chip.on {
		background: var(--ink);
		color: var(--paper);
		border-color: var(--ink);
	}
	table { width: 100%; border-collapse: collapse; font-family: 'JetBrains Mono', monospace; font-size: 10.5px; }
	td { padding: 2px 0; vertical-align: top; }
	td.k { color: var(--ink-soft); }
	td.v { text-align: right; font-weight: 500; }
	/* A DID is long and must stay selectable/copyable -- it's the unambiguous
	   identifier when there's no handle. Left-align and let it wrap rather
	   than truncating text a user might need to copy in full. */
	td.v.idval { text-align: left; overflow-wrap: anywhere; user-select: text; }
	.you { font-weight: 700; }
	.legend-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
	.legend-head .ghost.sm { padding: 3px 6px; }
	.legend, .errs { display: flex; flex-direction: column; gap: 3px; }
	.leg {
		display: grid;
		grid-template-columns: 1fr auto;
		align-items: center;
		gap: 6px;
		border-left: 2px solid transparent;
		padding-left: 4px;
	}
	.leg.hidden { opacity: 0.45; }
	.leg-main {
		display: grid;
		grid-template-columns: 11px 1fr auto;
		gap: 7px;
		align-items: center;
		font-family: 'JetBrains Mono', monospace;
		font-size: 10px;
		background: transparent;
		border: 0;
		padding: 1px 0;
		color: var(--ink);
		text-transform: none;
		letter-spacing: 0;
		font-weight: 400;
		text-align: left;
		cursor: pointer;
	}
	/* Swatch colour is data, so "hidden" is never signalled by colour alone --
	   a filled square is active, a hollow (outlined-only) square is hidden. */
	.swatch {
		width: 11px;
		height: 11px;
		display: block;
		background: hsl(var(--hue) 74% 50%);
		border: 1px solid hsl(var(--hue) 74% 50%);
	}
	.swatch.hollow { background: transparent; }
	.leg-main span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: rtl; text-align: left; }
	.leg-main b { font-weight: 500; color: var(--ink-soft); }
	.only {
		flex: none;
		font-family: 'JetBrains Mono', monospace;
		font-size: 8.5px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		background: transparent;
		color: var(--ink-soft);
		border: 0;
		padding: 1px 2px;
		cursor: pointer;
	}
	.only:hover { color: var(--ink); }
	.errs { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--ink-soft); }
	.e { display: flex; justify-content: space-between; gap: 8px; }
	hr { border: 0; border-top: 1px solid var(--rule); margin: 0; }
	.note { font-size: 10px; line-height: 1.45; color: var(--ink-soft); margin: 0; }
	.note.warn { color: var(--ink); border-left: 2px solid var(--ink); padding-left: 8px; }

	/* Below this width the rail is an overlay drawer, not a column.
	   The alternative -- stacking rail above map -- measured 605px of rail to
	   239px of map on a 390x844 phone. At that size buildTreemap resolves
	   almost nothing into individual cells and reports most of the repo as
	   `aggregated` blocks, so the map stops supporting its only claim, that
	   area is proportional to stored size. The map gets the viewport; the
	   controls come over the top of it on demand.

	   `display: none` when closed rather than a translate: an off-screen
	   transformed panel stays in the tab order and in the accessibility tree,
	   so a keyboard or screen-reader user would walk 195 legend buttons they
	   cannot see. And no slide transition -- constraint 5 prohibits decorative
	   motion, and a drawer that simply is where it is loses nothing. */
	@media (max-width: 820px) {
		.rail {
			display: none;
			position: fixed;
			/* under RecordModal's scrim (20) and dialog (21): a record opened
			   from the map must never be covered by the controls that are
			   behind it, and that modal carries the delete button. */
			z-index: 15;
			top: 0;
			bottom: 0;
			left: 0;
			width: min(340px, 88vw);
			max-width: 100%;
			/* the drawer's own scroll must not chain to the page behind it */
			overscroll-behavior: contain;
			border-right: 1px solid var(--ink);
			padding: 16px max(16px, env(safe-area-inset-right)) calc(32px + env(safe-area-inset-bottom))
				max(16px, env(safe-area-inset-left));
		}
		.rail.open { display: flex; }
		.shut {
			display: block;
			flex: none;
			background: transparent;
			color: var(--ink);
			border: 1px solid var(--rule);
			min-height: 44px;
			padding: 0 12px;
		}
		/* 44px is the smallest reliably tappable target. The desktop rail is
		   built at 30px, which is a miss-prone control on glass. */
		.row button,
		.txt,
		.dtrow input {
			min-height: 44px;
		}
		/* Measured: a native date control rendering `dd/mm/yyyy` plus its picker
		   glyph needs 160px at the 16px minimum font size that keeps iOS from
		   zooming, so two of them plus the gap want 326px inside 308px of drawer
		   and the `to` field loses its right edge. They stack. */
		.dates { flex-direction: column; }
		.clr { width: 34px; }
		/* the legend is the densest thing here: ~195 rows on a large repo, each
		   a toggle plus an "only". Give both real height without turning the
		   list into a scroll marathon. */
		.leg-main { padding: 7px 0; }
		.leg-main span { font-size: 11px; }
		.only { padding: 8px 6px; font-size: 9.5px; }
		table { font-size: 11.5px; }
		.e { font-size: 11px; }
	}
</style>
