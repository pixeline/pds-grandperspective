<!-- src/lib/components/PolarProfile.svelte -->
<script>
	import { polarLayout } from '$lib/repo/polar.js';
	import { paintPolar } from '$lib/repo/polarpaint.js';
	import { dominantType } from '$lib/repo/behavior.js';
	import { fmtNum } from '$lib/repo/format.js';

	/** @type {{ vector: any, size?: number }} */
	let { vector = null, size = 220 } = $props();

	let canvas = $state(null);
	let hover = $state(null); // the axis under the pointer, or null
	let showInfo = $state(false);

	const totalDrawn = $derived(
		vector ? ['create','converse','amplify','react','curate','connect','identity']
			.reduce((s, k) => s + vector[k], 0) : 0
	);
	const type = $derived(vector ? dominantType(vector) : { ray: null, label: '—' });
	const layout = $derived(vector ? polarLayout(vector, { size }) : null);

	const inkOf = (name) =>
		getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000';

	// Draw whenever the layout changes. Neutral chrome comes from CSS vars so the
	// chart follows the app's light/dark ink like every other surface.
	$effect(() => {
		if (!canvas || !layout || totalDrawn === 0) return;
		const ratio = window.devicePixelRatio || 1;
		canvas.width = size * ratio;
		canvas.height = size * ratio;
		const ctx = canvas.getContext('2d');
		ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
		ctx.clearRect(0, 0, size, size);
		paintPolar(ctx, layout, {
			ink: inkOf('--ink'),
			inkSoft: inkOf('--ink-soft'),
			fill: 'color-mix(in srgb, var(--ink) 12%, transparent)'
		});
	});

	// Pointer → nearest axis by angle (cheaper and steadier than point distance
	// in a small chart). Only registers a hover inside the plot radius.
	function onMove(e) {
		if (!layout) return;
		const rect = canvas.getBoundingClientRect();
		const mx = e.clientX - rect.left;
		const my = e.clientY - rect.top;
		const dx = mx - layout.center.x;
		const dy = my - layout.center.y;
		if (Math.hypot(dx, dy) > layout.radius + 8) { hover = null; return; }
		let ang = Math.atan2(dy, dx) + Math.PI / 2; // 0 at the top
		if (ang < 0) ang += 2 * Math.PI;
		const i = Math.round(ang / ((2 * Math.PI) / 7)) % 7;
		hover = layout.axes[i];
	}

	const asDate = (ts) => (ts == null ? '—' : new Date(ts).toISOString().slice(0, 10));
</script>

<section class="polar" aria-label="Behavioural profile">
	<div class="cap">
		<span class="lbl">Behaviour</span>
		<button
			class="info"
			aria-label="About this chart"
			onclick={() => (showInfo = !showInfo)}
			onmouseenter={() => (showInfo = true)}
			onmouseleave={() => (showInfo = false)}
		>i</button>
	</div>

	{#if !vector || totalDrawn === 0}
		<p class="empty">no records</p>
	{:else}
		<div
			class="plot"
			onpointermove={onMove}
			onpointerleave={() => (hover = null)}
		>
			<canvas bind:this={canvas} style="width:{size}px;height:{size}px"></canvas>
			{#each layout.axes as a (a.key)}
				<span class="axlbl" style="left:{a.x}px; top:{a.y}px">{a.label}</span>
			{/each}
		</div>

		<p class="type">{type.label}</p>

		{#if hover}
			<p class="read">
				<b>{hover.label}</b> · {fmtNum(hover.count)} · last {asDate(vector.lastActive[hover.key])}
			</p>
		{/if}
	{/if}

	{#if showInfo}
		<div class="pop" role="note">
			<p>A best-guess behavioural estimate from records this account emitted; reading and lurking leave no record and are not shown.</p>
			{#if vector && vector.unclassified > 0}
				<p>{fmtNum(vector.unclassified)} record{vector.unclassified === 1 ? '' : 's'} unclassified across {vector.unclassifiedCols.length} collection{vector.unclassifiedCols.length === 1 ? '' : 's'}.</p>
			{/if}
			<p class="cite">Modes after Forrester Social Technographics (Li &amp; Bernoff, 2008).</p>
		</div>
	{/if}
</section>

<style>
	.polar {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px 0;
		border-top: 1px solid var(--ink-soft);
	}
	.cap { display: flex; align-items: center; justify-content: space-between; }
	.lbl {
		font-family: 'Inter', sans-serif;
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--ink-soft);
	}
	.info {
		width: 16px; height: 16px;
		border: 1px solid var(--ink-soft);
		background: transparent;
		color: var(--ink-soft);
		font-family: 'JetBrains Mono', monospace;
		font-size: 10px;
		line-height: 1;
		cursor: help;
	}
	.plot { position: relative; align-self: center; }
	.axlbl {
		position: absolute;
		transform: translate(-50%, -50%);
		font-family: 'Inter', sans-serif;
		font-size: 8px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-soft);
		pointer-events: none;
		white-space: nowrap;
	}
	.type {
		margin: 0;
		text-align: center;
		font-family: 'JetBrains Mono', monospace;
		font-size: 15px;
		color: var(--ink);
	}
	.read, .empty {
		margin: 0;
		font-family: 'JetBrains Mono', monospace;
		font-size: 11px;
		color: var(--ink-soft);
		text-align: center;
	}
	.pop {
		border: 1px solid var(--ink-soft);
		padding: 8px;
		font-family: 'Inter', sans-serif;
		font-size: 10.5px;
		line-height: 1.5;
		color: var(--ink);
	}
	.pop p { margin: 0 0 6px; }
	.pop p:last-child { margin-bottom: 0; }
	.cite { color: var(--ink-soft); }
</style>
