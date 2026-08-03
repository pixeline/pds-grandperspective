<script>
	import { buildTreemap } from '$lib/repo/treemap.js';
	import { buildIndex, hitTest } from '$lib/repo/hittest.js';
	import { fmtBytes, fmtNum } from '$lib/repo/format.js';
	import { paintMap } from '$lib/repo/paint.js';
	import { exportPng, TARGETS } from '$lib/repo/exportpng.js';

	let {
		records = [],
		hueOf,
		weigh = $bindable('bytes'),
		exact = true,
		/** repository this map is of; names the downloaded file */
		label = null,
		onhover,
		onopen
	} = $props();

	let canvas = $state(null);
	let w = $state(900);
	let h = $state(600);
	let focusedIndex = $state(-1);
	/** @type {string | null} */
	let saving = $state(null);
	/** @type {string | null} */
	let saveError = $state(null);

	// lay out at the container's real size. A floor here would compute the
	// layout for a larger space than is actually drawn, silently clipping most
	// of the repo out of view with nothing telling the viewer it exists — the
	// exact dishonesty this project exists to avoid. A small container
	// genuinely resolves fewer cells, and buildTreemap already says so
	// honestly via `aggregated`; only guard the true zero/negative case.
	/** `weigh` is a bindable string prop; buildTreemap only accepts the two. */
	const weighing = $derived(/** @type {'bytes' | 'records'} */ (weigh));
	const map = $derived(
		buildTreemap(records, { w: Math.max(w, 1), h: Math.max(h, 1), weigh: weighing, hueOf })
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
						// treemap.js no longer puts a rkey on an aggregate block
						// -- it never identified the whole block, only one
						// arbitrary member of it -- so this is always null.
						rkey: null,
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
		const isMobile = w <= 820;
		const labelScale = isMobile ? 1.3 : 1;
		const labelInset = isMobile ? { top: 56, left: 0 } : { top: 0, left: 0 };
		draw(canvas, map, w, h, ratio, flatCells, safeFocusedIndex, labelScale, labelInset);
	});

	// True neutral ink (--ink) and ground (--ground) are read from the cascade
	// rather than hard-coded, since a stale literal here would quietly drift
	// from the palette (ink used to be #161a18, the retired green-tinted ink)
	// whenever the CSS variable changes.
	/** @param {HTMLElement} el */
	function palette(el) {
		const cs = getComputedStyle(el);
		return {
			ink: cs.getPropertyValue('--ink').trim() || '#171717',
			ground: cs.getPropertyValue('--ground').trim() || '#f7f7f7'
		};
	}

	function draw(cv, m, cw, ch, ratio, cells, focusIdx, labelScale = 1, labelInset = { top: 0, left: 0 }) {
		cv.width = Math.round(cw * ratio);
		cv.height = Math.round(ch * ratio);
		cv.style.width = `${cw}px`;
		cv.style.height = `${ch}px`;

		const ctx = cv.getContext('2d');
		ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

		const { ink } = palette(cv);
		// the same painter the PNG export uses -- see paint.js
		paintMap(ctx, m, { w: cw, h: ch, ink, background: null, labels: true, labelScale, labelInset });

		// Keyboard focus outline, drawn last so it always shows on top. It stays
		// here rather than in the shared painter: it is view state, and an
		// exported image must not carry it.
		if (focusIdx >= 0 && cells[focusIdx]) {
			const f = cells[focusIdx];
			ctx.strokeStyle = ink;
			ctx.lineWidth = 1;
			ctx.strokeRect(f.x + 0.5, f.y + 0.5, Math.max(0, f.w - 1), Math.max(0, f.h - 1));
		}
	}

	/** @param {string} kind */
	async function savePng(kind) {
		if (saving || !canvas) return;
		saving = kind;
		saveError = null;
		try {
			const { ink, ground } = palette(canvas);
			await exportPng({
				kind,
				viewport: { w, h, ratio: window.devicePixelRatio || 1 },
				records,
				hueOf,
				weigh: weighing,
				ink,
				background: ground,
				label
			});
		} catch (/** @type {any} */ err) {
			saveError = String(err?.message ?? err);
		} finally {
			saving = null;
		}
	}

	function at(ev) {
		const r = canvas.getBoundingClientRect();
		// The exact point, never a nearest-cell search within some slop radius.
		// Cells on a phone are routinely under a finger's width, so a fuzzy hit
		// would resolve to a neighbouring record -- and the modal this opens
		// carries a delete button. Missing and getting nothing is recoverable;
		// hitting confidently and getting the wrong record is not.
		return hitTest(index, ev.clientX - r.left, ev.clientY - r.top);
	}

	/**
	 * Hover is a pointing-device idea. A touch has no hover state: iOS
	 * synthesises a mousemove at the tap point just before the click, so with
	 * mouse handlers the tooltip flashed up and was immediately buried by the
	 * record modal the same tap opened. Tapping goes straight to the record --
	 * which is the tooltip's content and more.
	 */
	function onpointermove(ev) {
		if (ev.pointerType === 'touch') return;
		onhover?.(at(ev));
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
		{onpointermove}
		onpointerleave={() => onhover?.(null)}
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
		<span class="png">
			PNG
			{#each Object.entries(TARGETS) as [kind, t] (kind)}
				<button
					class="wt"
					disabled={!!saving || !records.length}
					onclick={() => savePng(kind)}
					title={kind === 'screen' ? `${Math.round(w)}×${Math.round(h)}` : `${t.w}×${t.h}`}
				>
					{saving === kind ? '…' : t.button}
				</button>
			{/each}
		</span>
		{#if saveError}<span class="err">{saveError}</span>{/if}
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
		/* Drop the ~300ms wait-for-a-second-tap before a tap becomes a click,
		   which on a map you explore by tapping reads as the app being stuck.
		   `manipulation` keeps pinch-zoom, which is the only way to read an
		   11px mono cell label on a phone. */
		touch-action: manipulation;
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
	.wt:hover:not(:disabled) {
		background: var(--ink);
		color: var(--paper);
	}
	.wt:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.png {
		display: flex;
		align-items: center;
		gap: 4px;
		color: var(--ink-soft);
		letter-spacing: 0.08em;
	}
	.err {
		color: var(--ink);
		border-left: 2px solid var(--ink);
		padding-left: 6px;
	}

	@media (max-width: 820px) {
		/* The desktop strip is a floating label with `max-width: calc(100% -
		   220px)` to clear the tooltip. On a 390px phone that leaves 170px, so
		   the sentence stacks into a tall narrow column over the map. A phone
		   has no tooltip to clear (see the pointerType guard above), so the
		   strip spans the width and sits flush to the bottom edge instead. */
		.info {
			left: 0;
			right: 0;
			bottom: 0;
			max-width: none;
			border-left: 0;
			border-right: 0;
			border-bottom: 0;
			gap: 6px 10px;
			padding: 7px 12px calc(7px + env(safe-area-inset-bottom));
			padding-left: max(12px, env(safe-area-inset-left));
			padding-right: max(12px, env(safe-area-inset-right));
		}
		.wt {
			min-height: 36px;
			padding: 2px 10px;
		}
	}
</style>
