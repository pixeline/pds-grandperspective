<script>
	import { onDestroy } from 'svelte';
	import Typeahead from './Typeahead.svelte';
	import Footer from './Footer.svelte';
	import { fmtBytes, fmtNum } from '$lib/repo/format.js';

	let {
		handle = $bindable(''),
		filters = $bindable({ hidden: new Set(), from: null, to: null, query: '' }),
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

	const hasActiveFilters = $derived(
		filters.hidden.size > 0 || filters.from != null || filters.to != null || filters.query.trim() !== ''
	);

	function clearFilters() {
		queryInput = '';
		filters = { ...filters, hidden: new Set(), from: null, to: null, query: '' };
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

<aside class="rail">
	<h1>GrandPerspective<small>PDS EDITION</small></h1>

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
				<p class="note warn">
					Your authorization server did not grant repository write access. Editing is disabled.
				</p>
			{/if}
		{/if}
		{#if session?.error}
			<p class="note warn">{session.error}</p>
		{/if}
	</div>

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
		<div class="row">
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
		{#if hasActiveFilters}
			<button class="ghost sm" onclick={clearFilters}>Clear filters</button>
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

	<div class="grp">
		<div class="legend-head">
			<span class="lbl">Hue = collection</span>
			{#if filters.hidden.size}
				<button class="ghost sm" onclick={showAll}>Show all</button>
			{/if}
		</div>
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
	.dtrow { display: flex; align-items: stretch; gap: 3px; }
	.dtrow input {
		font-family: 'IBM Plex Mono', monospace;
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
	table { width: 100%; border-collapse: collapse; font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; }
	td { padding: 2px 0; vertical-align: top; }
	td.k { color: var(--ink-soft); }
	td.v { text-align: right; font-weight: 500; }
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
		font-family: 'IBM Plex Mono', monospace;
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
		font-family: 'IBM Plex Mono', monospace;
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
	.errs { font-family: 'IBM Plex Mono', monospace; font-size: 10px; color: var(--ink-soft); }
	.e { display: flex; justify-content: space-between; gap: 8px; }
	hr { border: 0; border-top: 1px solid var(--rule); margin: 0; }
	.note { font-size: 10px; line-height: 1.45; color: var(--ink-soft); margin: 0; }
	.note.warn { color: var(--ink); border-left: 2px solid var(--ink); padding-left: 8px; }
</style>
