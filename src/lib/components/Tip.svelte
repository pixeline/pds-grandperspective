<script>
	import { fmtBytes, fmtDate, fmtDur } from '$lib/portrait/params.js';

	/** @type {{info:any, hueOf:Map<string,number>}} */
	let { info, hueOf } = $props();

	const cadence = $derived(
		info?.plate
			? info.plate.cadence < 0.01
				? `${(info.plate.cadence * 60).toFixed(2)} rec/h`
				: `${info.plate.cadence.toFixed(2)} rec/min`
			: null
	);
</script>

{#if info}
	<div class="tip">
		{#if info.plate}
			{@const p = info.plate}
			{@const m = info.mark}
			<div class="t">plate {p.n} of {p.of} · {m ? 'mark' : 'session'}</div>
			<table>
				<tbody>
					{#if m?.kind === 'tear'}
						<tr><td class="k">torn mark</td><td class="v">{m.err}</td></tr>
						{#if m.rkey}<tr><td class="k">rkey</td><td class="v">{m.rkey}</td></tr>{/if}
					{:else if m?.kind === 'transition'}
						<tr>
							<td class="k">transition</td>
							<td class="v">{m.from.split('.').pop()} → {m.to.split('.').pop()}</td>
						</tr>
					{:else if m?.kind === 'region'}
						<tr><td class="k">region</td><td class="v">{m.col}</td></tr>
						<tr><td class="k">here</td><td class="v">{m.count} of {p.records} rec</td></tr>
					{/if}
					<tr><td class="k">began</td><td class="v">{fmtDate(p.start)}</td></tr>
					<tr><td class="k">lasted</td><td class="v">{fmtDur(p.end - p.start)}</td></tr>
					<tr><td class="k">records</td><td class="v">{p.records}</td></tr>
					<tr>
						<td class="k">silence before</td>
						<td class="v">{p.silence ? fmtDur(p.silence) : '—'}</td>
					</tr>
					<tr><td class="k">cadence</td><td class="v">{cadence}</td></tr>
					<tr><td class="k">collections</td><td class="v">{p.collections}</td></tr>
					{#if p.errs}<tr><td class="k">invalid</td><td class="v">{p.errs}</td></tr>{/if}
				</tbody>
			</table>
			<div class="cols">
				{#each p.top as [col, n] (col)}
					<div class="leg">
						<i style="background:hsl({hueOf.get(col)} 74% 50%)"></i>
						<span title={col}>{col}</span><b>{n}</b>
					</div>
				{/each}
			</div>
			{#if m}
				<p class="hint">click → {m.rkey ? 'this record' : 'this collection'} on pdsls.dev</p>
			{/if}
		{:else}
			<div class="t">{info.aggregate ? 'collection' : 'record'}</div>
			<table>
				<tbody>
					<tr><td class="k">collection</td><td class="v">{info.col ?? info.nsid}</td></tr>
					{#if info.aggregate}
						<tr><td class="k">records</td><td class="v">{info.records}</td></tr>
					{/if}
					{#if info.rkey}<tr><td class="k">rkey</td><td class="v">{info.rkey}</td></tr>{/if}
					{#if info.ts}<tr><td class="k">timestamp</td><td class="v">{fmtDate(info.ts)}</td></tr>{/if}
					{#if info.bytes}<tr><td class="k">stored</td><td class="v">{fmtBytes(info.bytes)}</td></tr>{/if}
					{#if info.err}<tr><td class="k">invalid</td><td class="v">{info.err}</td></tr>{/if}
				</tbody>
			</table>
			<p class="hint">click → open on pdsls.dev</p>
		{/if}
	</div>
{/if}

<style>
	.tip {
		position: absolute;
		right: 18px;
		top: 104px;
		width: 262px;
		background: var(--paper);
		border: 1px solid var(--rule);
		padding: 10px 12px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		pointer-events: none;
		z-index: 5;
	}
	.t {
		font-weight: 800;
		font-size: 11px;
		letter-spacing: 0.02em;
		text-transform: uppercase;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-family: 'IBM Plex Mono', monospace;
		font-size: 10px;
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
		word-break: break-all;
	}
	.cols {
		display: flex;
		flex-direction: column;
		gap: 2px;
		border-top: 1px solid var(--rule);
		padding-top: 5px;
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
	.hint {
		font-size: 9px;
		letter-spacing: 0.04em;
		color: var(--ink-soft);
		font-style: italic;
		margin: 0;
	}
</style>
