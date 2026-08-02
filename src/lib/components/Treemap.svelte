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
	let focusedIndex = $state(-1);

	// lay out at the container's real size. A floor here would compute the
	// layout for a larger space than is actually drawn, silently clipping most
	// of the repo out of view with nothing telling the viewer it exists — the
	// exact dishonesty this project exists to avoid. A small container
	// genuinely resolves fewer cells, and buildTreemap already says so
	// honestly via `aggregated`; only guard the true zero/negative case.
	const map = $derived(
		buildTreemap(records, { w: Math.max(w, 1), h: Math.max(h, 1), weigh, hueOf })
	);
	const index = $derived(buildIndex(map.blocks, Math.max(w, 1), Math.max(h, 1)));
	const totalBytes = $derived(records.reduce((s, r) => s + (r.bytes || 0), 0));

	// flat, layout-ordered list of everything drawable: one entry per real
	// cell, or one per aggregate block. This is the keyboard's world — arrow
	// keys walk this array, and its rects double as the focus outline's
	// coordinates, so keyboard focus always lines up with what's drawn.
	const flatCells = $derived(buildFlatCells(map));
	const safeFocusedIndex = $derived(
		focusedIndex >= 0 && focusedIndex < flatCells.length ? focusedIndex : -1
	);
	const announce = $derived.by(() => {
		if (safeFocusedIndex < 0) return '';
		const hit = flatCells[safeFocusedIndex].hit;
		const col = hit.col ?? hit.nsid;
		if (hit.aggregate) {
			return `${col}, ${fmtNum(hit.records)} records, ${fmtBytes(hit.bytes)}, too small to resolve individually`;
		}
		return `${col} ${hit.rkey}, ${fmtBytes(hit.bytes || 0)}`;
	});

	function buildFlatCells(m) {
		const out = [];
		for (const b of m.blocks) {
			if (b.aggregate || !b.cells.length) {
				// same guard as draw(): an empty collection has neither cells nor
				// a colour, so it is not a real drawable thing to focus
				if (!b.color) continue;
				out.push({
					x: b.x,
					y: b.y,
					w: b.w,
					h: b.h,
					cols: 1,
					hit: {
						nsid: b.nsid,
						col: b.nsid,
						rkey: b.rkey ?? null,
						records: b.records,
						bytes: b.bytes,
						aggregate: true
					}
				});
				continue;
			}
			// Approximate the block's own column count, so Up/Down can step by
			// a row within this block. Cells are squarified (variable rect
			// sizes, not a uniform grid -- see treemap.js), so there is no
			// exact column count to recover; this is the same aspect-ratio
			// estimate treemap.js itself uses to decide whether cells can
			// resolve at all, good enough for keyboard stepping.
			const cols = Math.max(1, Math.round(Math.sqrt((b.cells.length * b.w) / Math.max(b.h, 1))));
			for (const c of b.cells) {
				out.push({
					x: b.x + c.x,
					y: b.y + c.y,
					w: c.w,
					h: c.h,
					cols,
					hit: {
						nsid: b.nsid,
						col: c.col,
						rkey: c.rkey,
						ts: c.ts,
						bytes: c.bytes,
						err: c.err,
						undated: c.undated,
						aggregate: false
					}
				});
			}
		}
		return out;
	}

	$effect(() => {
		if (!canvas) return;
		// devicePixelRatio never changes mid-session in any way this app
		// reacts to; making it reactive state read and written in this same
		// effect only makes the effect its own dependency, forcing a second
		// redraw on mount on every HiDPI display once the real ratio replaces
		// the initial guess of 1
		const ratio = window.devicePixelRatio || 1;
		draw(canvas, map, w, h, ratio, flatCells, safeFocusedIndex);
	});

	/**
	 * Batch by fill colour: setting fillStyle per record would be ~200k state
	 * changes on a large repo, where grouping makes it a few thousand.
	 */
	function draw(cv, m, cw, ch, ratio, cells, focusIdx) {
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

		// True neutral ink (--ink: #171717) is the only chrome colour on
		// screen; read it rather than hard-coding, since a stale literal here
		// would quietly drift from the palette (this used to be #161a18, the
		// retired green-tinted ink) whenever the CSS variable changes.
		const ink = getComputedStyle(cv).getPropertyValue('--ink').trim() || '#171717';

		// labels last, so no cell paints over them
		ctx.font = '8.5px "IBM Plex Mono", monospace';
		ctx.textBaseline = 'top';
		for (const b of m.blocks) {
			if (!b.label) continue;
			const tw = ctx.measureText(b.label).width;
			ctx.fillStyle = 'rgba(255,255,255,0.84)';
			ctx.fillRect(b.x, b.y, tw + 6, 12);
			ctx.fillStyle = ink;
			ctx.fillText(b.label, b.x + 3, b.y + 2);
		}

		// keyboard focus outline, drawn last so it always shows on top
		if (focusIdx >= 0 && cells[focusIdx]) {
			const f = cells[focusIdx];
			ctx.strokeStyle = ink;
			ctx.lineWidth = 1;
			ctx.strokeRect(f.x + 0.5, f.y + 0.5, Math.max(0, f.w - 1), Math.max(0, f.h - 1));
		}
	}

	function at(ev) {
		const r = canvas.getBoundingClientRect();
		return hitTest(index, ev.clientX - r.left, ev.clientY - r.top);
	}

	function onfocus() {
		if (safeFocusedIndex < 0 && flatCells.length) focusedIndex = 0;
	}

	function onkeydown(ev) {
		const n = flatCells.length;
		if (!n) return;
		const i = safeFocusedIndex;
		const cols = i >= 0 ? flatCells[i].cols : 1;
		let next = i;

		switch (ev.key) {
			case 'ArrowRight':
				next = Math.min(n - 1, (i < 0 ? -1 : i) + 1);
				break;
			case 'ArrowLeft':
				next = Math.max(0, (i < 0 ? 1 : i) - 1);
				break;
			case 'ArrowDown':
				next = Math.min(n - 1, (i < 0 ? -cols : i) + cols);
				break;
			case 'ArrowUp':
				next = Math.max(0, (i < 0 ? cols : i) - cols);
				break;
			case 'Home':
				next = 0;
				break;
			case 'End':
				next = n - 1;
				break;
			case 'Enter':
			case ' ':
				if (i >= 0) onopen?.(flatCells[i].hit);
				ev.preventDefault();
				return;
			default:
				return;
		}

		ev.preventDefault();
		focusedIndex = next;
		onhover?.(flatCells[next]?.hit ?? null);
	}
</script>

<div class="map" bind:clientWidth={w} bind:clientHeight={h}>
	<canvas
		bind:this={canvas}
		tabindex="0"
		onmousemove={(e) => onhover?.(at(e))}
		onmouseleave={() => onhover?.(null)}
		onclick={(e) => {
			const hit = at(e);
			if (hit) onopen?.(hit);
		}}
		onfocus={onfocus}
		onkeydown={onkeydown}
		aria-label="Treemap of repository contents. {fmtNum(records.length)} records. Arrow keys move between cells, Enter opens the focused one."
	></canvas>

	<div class="sr-only" aria-live="polite">{announce}</div>

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
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
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
