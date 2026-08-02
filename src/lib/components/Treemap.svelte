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
