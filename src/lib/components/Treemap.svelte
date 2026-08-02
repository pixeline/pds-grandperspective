<script>
	import { buildTreemap } from '$lib/repo/treemap.js';
	import { fmtBytes, fmtNum } from '$lib/repo/format.js';

	let { records = [], hueOf, weigh = $bindable('bytes'), onhover, onopen } = $props();

	let w = $state(900);
	let h = $state(600);

	// never lay out into a collapsed container: everything would silently
	// collapse into "too small to resolve" and read as if that were the truth
	const map = $derived(
		buildTreemap(records, {
			w: Math.max(w, 700),
			h: Math.max(h, 460),
			weigh,
			hueOf
		})
	);
	const totalBytes = $derived(records.reduce((s, r) => s + (r.bytes || 0), 0));
</script>

<div
	class="map"
	bind:clientWidth={w}
	bind:clientHeight={h}
	onmouseleave={() => onhover?.(null)}
	role="application"
	aria-label="Treemap of repo contents"
>
	{#each map.blocks as b (b.nsid)}
		<div class="blk" style="left:{b.x}px;top:{b.y}px;width:{b.w}px;height:{b.h}px">
			{#if b.aggregate}
				<button
					class="c agg"
					style="background:{b.color}"
					title={b.nsid}
					onmouseover={() =>
						onhover?.({ nsid: b.nsid, records: b.records, bytes: b.bytes, aggregate: true })}
					onfocus={() =>
						onhover?.({ nsid: b.nsid, records: b.records, bytes: b.bytes, aggregate: true })}
					onclick={() => onopen?.({ col: b.nsid, rkey: b.rkey })}
				></button>
			{:else}
				{#each b.cells as c, i (i)}
					<button
						class="c"
						style="left:{c.x}px;top:{c.y}px;width:{c.w}px;height:{c.h}px;background:{c.color}"
						onmouseover={() => onhover?.(c)}
						onfocus={() => onhover?.(c)}
						onclick={() => onopen?.({ col: c.col, rkey: c.rkey })}
						aria-label="{c.col} {c.rkey}"
					></button>
				{/each}
			{/if}
			{#if b.label}<span class="lb">{b.label}</span>{/if}
		</div>
	{/each}

	<div class="info">
		{map.leaves} collections · {fmtNum(records.length)} records · {fmtBytes(totalBytes)} ·
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
	.blk {
		position: absolute;
		overflow: hidden;
	}
	.c {
		position: absolute;
		border: 0;
		padding: 0;
		cursor: pointer;
	}
	.c.agg {
		inset: 0;
		width: 100%;
		height: 100%;
	}
	.lb {
		position: absolute;
		left: 0;
		top: 0;
		pointer-events: none;
		font-family: 'IBM Plex Mono', monospace;
		font-size: 8.5px;
		letter-spacing: -0.01em;
		color: var(--ink);
		background: color-mix(in srgb, var(--paper) 84%, transparent);
		padding: 1px 3px;
		white-space: nowrap;
		max-width: 100%;
		overflow: hidden;
	}
	.info {
		position: absolute;
		left: 18px;
		bottom: 16px;
		/* leave room for the viewer toggle, which sits bottom-right */
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
