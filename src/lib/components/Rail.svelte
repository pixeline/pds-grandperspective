<script>
	import Typeahead from './Typeahead.svelte';
	import { fmtBytes, fmtNum } from '$lib/repo/format.js';

	let {
		handle = $bindable(''),
		params = $bindable({}),
		busy = false,
		status = 'idle',
		stats = null,
		legend = [],
		errors = [],
		hueOf,
		ondraw,
		onstop
	} = $props();
</script>

<aside class="rail">
	<h1>Stills &amp; Frames<small>REPO PORTRAIT · PARAMETRIC</small></h1>

	<div class="grp">
		<span class="lbl">Handle or DID</span>
		<Typeahead bind:value={handle} onsubmit={(h) => ondraw(h)} />
		<div class="row">
			<button onclick={() => ondraw()} disabled={busy}>Draw</button>
			<button class="ghost" onclick={() => onstop()} disabled={!busy}>Stop</button>
		</div>
	</div>

	<hr />

	<div class="grp">
		<span class="lbl">Parameters</span>
		{#each PARAMS as p (p.key)}
			<div class="param">
				<div class="top">
					<span class="nm">{p.label}</span>
					<span class="val">{p.fmt(params[p.key])}</span>
				</div>
				<input
					type="range"
					min={p.min}
					max={p.max}
					step={p.step}
					bind:value={params[p.key]}
					aria-label={p.label}
				/>
				<span class="src">{p.src}</span>
			</div>
		{/each}
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
					<tr><td class="k">records read</td><td class="v">{fmtNum(stats.records)}</td></tr>
					<tr><td class="k">stored size</td><td class="v">{fmtBytes(stats.bytes)}</td></tr>
					<tr><td class="k">sessions</td><td class="v">{fmtNum(stats.sessions)}</td></tr>
					<tr><td class="k">plates drawn</td><td class="v">{stats.shown}</td></tr>
					<tr><td class="k">median session</td><td class="v">{stats.median} rec</td></tr>
					<tr><td class="k">longest silence</td><td class="v">{stats.longestSilence}</td></tr>
					<tr>
						<td class="k">invalid records</td>
						<td class="v">{stats.invalid} ({stats.invalidPct}%)</td>
					</tr>
					<tr><td class="k">first record</td><td class="v">{stats.first}</td></tr>
					{#if stats.truncated}
						<tr><td class="k">ceiling</td><td class="v">hit — raise it</td></tr>
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
					<div class="leg">
						<i style="background:hsl({hueOf.get(col)} 74% 50%)"></i>
						<span title={col}>{col}</span>
						<b>{fmtNum(n)}</b>
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
				<p class="note">
					No invalid records. A clean repo draws a clean plate — that is the honest result, not a
					bug.
				</p>
			{:else}
				<p class="note">Glitch is not a filter here. Torn blocks are real invalid records.</p>
			{/if}
		</div>
	</div>

	<hr />
	<p class="note">
		Drag to orbit · scroll to fly through time · shift+scroll to zoom · W/S or ↑/↓ thrust, A/D or
		←/→ turn, Q/E pitch · hover a mark to read its session, click it to open that record on
		pdsls.dev · every mark traces to a number in the repo.
	</p>
</aside>

<style>
	.rail {
		background: var(--paper);
		border-right: 1px solid var(--rule);
		padding: 18px 16px 40px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	h1 {
		font-size: 15px;
		font-weight: 800;
		letter-spacing: -0.03em;
		text-transform: uppercase;
		margin: 0;
		line-height: 1.05;
	}
	h1 small {
		display: block;
		font-size: 9.5px;
		font-weight: 600;
		letter-spacing: 0.14em;
		color: var(--ink-soft);
		margin-top: 5px;
	}
	.grp {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.lbl {
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--ink-soft);
	}
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
	button.ghost {
		background: transparent;
		color: var(--ink);
	}
	button:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.row {
		display: flex;
		gap: 6px;
	}
	.row > * {
		flex: 1;
	}
	.param {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.param .top {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 8px;
	}
	.param .val {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 11px;
		font-weight: 500;
	}
	.param .nm {
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ink-soft);
	}
	.param .src {
		font-size: 8.5px;
		letter-spacing: 0.05em;
		color: var(--ink-soft);
		font-style: italic;
	}
	input[type='range'] {
		width: 100%;
		accent-color: var(--ink);
		height: 16px;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-family: 'IBM Plex Mono', monospace;
		font-size: 10.5px;
	}
	td {
		padding: 2px 0;
		vertical-align: top;
	}
	td.k {
		color: var(--ink-soft);
	}
	td.v {
		text-align: right;
		font-weight: 500;
	}
	.legend,
	.errs {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.leg {
		display: grid;
		grid-template-columns: 11px 1fr auto;
		gap: 7px;
		align-items: center;
		font-family: 'IBM Plex Mono', monospace;
		font-size: 10px;
	}
	.leg i {
		width: 11px;
		height: 11px;
		display: block;
	}
	.leg span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		direction: rtl;
		text-align: left;
	}
	.leg b {
		font-weight: 500;
		color: var(--ink-soft);
	}
	.errs {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 10px;
		color: var(--ink-soft);
	}
	.e {
		display: flex;
		justify-content: space-between;
		gap: 8px;
	}
	hr {
		border: 0;
		border-top: 1px solid var(--rule);
		margin: 0;
	}
	.note {
		font-size: 10px;
		line-height: 1.45;
		color: var(--ink-soft);
		margin: 0;
	}
</style>
