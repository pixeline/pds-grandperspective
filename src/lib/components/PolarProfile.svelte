<!-- src/lib/components/PolarProfile.svelte -->
<script>
	import { polarLayout } from '$lib/repo/polar.js';
	import { paintPolar } from '$lib/repo/polarpaint.js';
	import { dominantType, describeType, RAY_ORDER } from '$lib/repo/behavior.js';
	import { fmtNum } from '$lib/repo/format.js';

	/** @type {{ vector: any, size?: number, avatar?: string | null }} */
	let { vector = null, size = 220, avatar = null } = $props();

	// An account in this many distinct atproto apps or more is scouting the wider
	// atmosphere, not just living in one app.
	const EXPLORER_APPS = 4;

	// Axis labels sit this far outside the outer ring, in the padding band, so
	// they clear the polygon and its data points and stay legible.
	const LABEL_GAP = 15;
	const labelX = (a) => layout.center.x + (layout.radius + LABEL_GAP) * Math.cos(a.angle);
	const labelY = (a) => layout.center.y + (layout.radius + LABEL_GAP) * Math.sin(a.angle);

	let canvas = $state(null);
	let hover = $state(null); // the axis under the pointer/focus, or null
	/** @type {number | null} */
	let focusedIndex = $state(null); // keyboard focus index into layout.axes, or null
	let tab = $state('chart'); // 'chart' | 'about'

	const totalDrawn = $derived(
		vector ? RAY_ORDER.reduce((s, k) => s + vector[k], 0) : 0
	);
	const type = $derived(vector ? dominantType(vector) : { ray: null, label: '—' });
	// Extra padding leaves a band between the outer ring and the canvas edge for
	// the axis labels to sit in, clear of the plotted shape.
	const layout = $derived(vector ? polarLayout(vector, { size, pad: 32 }) : null);

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
		const ink = inkOf('--ink');
		paintPolar(ctx, layout, {
			ink,
			inkSoft: inkOf('--ink-soft'),
			// Canvas fillStyle cannot resolve a CSS var() -- the assignment is
			// silently rejected and falls back to #000000. Build the mix from
			// the already-resolved colour, which canvas parses fine.
			fill: `color-mix(in srgb, ${ink} 12%, transparent)`
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
		focusedIndex = i; // so a following arrow key continues from here, not index 0
	}

	// Keyboard equivalent of the pointer's angle-nearest lookup: the seven rays
	// have a fixed, known order (layout.axes), so arrow keys simply step
	// through it -- no angle math needed once a ray has keyboard focus.
	function onKeydown(e) {
		if (!layout) return;
		if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) {
			e.preventDefault();
			const current = focusedIndex ?? 0;
			const next =
				e.key === 'ArrowRight' || e.key === 'ArrowDown'
					? (current + 1) % 7
					: (current + 6) % 7;
			focusedIndex = next;
			hover = layout.axes[next];
		}
	}

	function onPlotFocus() {
		if (!layout) return;
		if (focusedIndex == null) focusedIndex = 0;
		hover = layout.axes[focusedIndex];
	}

	function onPlotBlur() {
		hover = null;
		focusedIndex = null;
	}

	const asDate = (ts) => (ts == null ? '—' : new Date(ts).toISOString().slice(0, 10));
</script>

<section class="polar" aria-label="Behavioural profile">
	<div class="cap">
		<span class="lbl">Behaviour</span>
		<div class="tabs" role="tablist" aria-label="Behaviour panel view">
			<button
				class="tab"
				role="tab"
				aria-selected={tab === 'chart'}
				class:on={tab === 'chart'}
				onclick={() => (tab = 'chart')}>Chart</button>
			<button
				class="tab"
				role="tab"
				aria-selected={tab === 'about'}
				class:on={tab === 'about'}
				onclick={() => (tab = 'about')}>About</button>
		</div>
	</div>

	{#if tab === 'about'}
		<div class="about">
			<p>Seven modes, counted from what this account has written: posts (Create), replies (Converse), reposts and quotes (Amplify), likes (React), lists and feeds (Curate), follows and blocks (Connect), profile records (Identity).</p>
			<p>Rays are log-scaled: the rings mark 10, 100, 1k and 10k records. The headline type is the mode this account does most, measured against a typical account, because likes dominate almost every repo.</p>
			<p>Hue marks the mode and greys out as it goes stale. A repo holds only what an account emits, so reading and lurking never appear.</p>
			{#if vector && vector.apps >= EXPLORER_APPS}
				<p>It keeps records in {vector.apps} atproto apps, so it is flagged an explorer.</p>
			{/if}
			{#if vector && vector.verifications > 0}
				<p>It issues verification records, so it is flagged a verifier.</p>
			{/if}
			{#if vector && vector.unclassified > 0}
				<p>{fmtNum(vector.unclassified)} record{vector.unclassified === 1 ? '' : 's'} went unclassified, across {vector.unclassifiedCols.length} collection{vector.unclassifiedCols.length === 1 ? '' : 's'}.</p>
			{/if}
			<p class="cite">Modes after Forrester Social Technographics (Li &amp; Bernoff, 2008).</p>
		</div>
	{:else if !vector || totalDrawn === 0}
		<p class="empty">no records</p>
	{:else}
		<div
			class="plot"
			role="group"
			tabindex="0"
			aria-label="Behavioural profile. Arrow keys move between the seven activity rays."
			onpointermove={onMove}
			onpointerleave={() => (hover = null)}
			onkeydown={onKeydown}
			onfocus={onPlotFocus}
			onblur={onPlotBlur}
		>
			<canvas bind:this={canvas} style="width:{size}px;height:{size}px"></canvas>
			{#each layout.axes as a (a.key)}
				<span class="axlbl" style="left:{labelX(a)}px; top:{labelY(a)}px">{a.label}</span>
			{/each}
		</div>

		<div class="headline">
			{#if avatar}
				<img
					class="avatar"
					src={avatar}
					alt=""
					width="40"
					height="40"
					onerror={(e) => (e.currentTarget.style.display = 'none')}
				/>
			{/if}
			<span class="type">{type.label}</span>
		</div>
		{#if type.ray}
			<p class="type-desc">{describeType(type.ray)}</p>
		{/if}
		{#if vector.verifications > 0 || vector.apps >= EXPLORER_APPS}
			<p class="badges">
				{#if vector.apps >= EXPLORER_APPS}
					<span class="badge">Explorer · {vector.apps} apps</span>
				{/if}
				{#if vector.verifications > 0}
					<span class="badge">Verifier · {fmtNum(vector.verifications)} issued</span>
				{/if}
			</p>
		{/if}

		<p class="read" aria-live="polite">
			{#if hover}
				<b>{hover.label}</b> · {fmtNum(hover.count)} · last {asDate(vector.lastActive[hover.key])}
			{/if}
		</p>
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
	.tabs { display: flex; gap: 4px; }
	.tab {
		border: 1px solid var(--ink-soft);
		background: transparent;
		color: var(--ink-soft);
		font-family: 'Inter', sans-serif;
		font-size: 8.5px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		padding: 3px 8px;
		cursor: pointer;
	}
	.tab.on { color: var(--ink); border-color: var(--ink); }
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
	.headline {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
	}
	/* A disc: the one deliberate exception to the no-rounded rule, because a
	   cropped profile photo reads as a face, not as decorative rounding. */
	.avatar {
		width: 40px;
		height: 40px;
		object-fit: cover;
		display: block;
		border: 1px solid var(--ink-soft);
		border-radius: 50%;
	}
	.type {
		font-family: 'JetBrains Mono', monospace;
		font-size: 15px;
		color: var(--ink);
	}
	.type-desc {
		margin: 4px 0 0;
		text-align: center;
		font-family: 'Inter', sans-serif;
		font-size: 10.5px;
		line-height: 1.4;
		color: var(--ink-soft);
	}
	.badges {
		margin: 6px 0 0;
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 6px;
	}
	.badge {
		border: 1px solid var(--ink-soft);
		padding: 2px 6px;
		font-family: 'Inter', sans-serif;
		font-size: 8.5px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ink);
	}
	.read, .empty {
		margin: 0;
		font-family: 'JetBrains Mono', monospace;
		font-size: 11px;
		color: var(--ink-soft);
		text-align: center;
	}
	.about {
		font-family: 'Inter', sans-serif;
		font-size: 10.5px;
		line-height: 1.5;
		color: var(--ink);
	}
	.about p { margin: 0 0 8px; }
	.about p:last-child { margin-bottom: 0; }
	.cite { color: var(--ink-soft); }
</style>
