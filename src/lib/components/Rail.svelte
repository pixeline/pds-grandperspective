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
