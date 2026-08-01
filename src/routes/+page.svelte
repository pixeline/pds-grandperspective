<script>
	import { onMount } from 'svelte';
	import Gate from '$lib/components/Gate.svelte';
	import Rail from '$lib/components/Rail.svelte';
	import Stack from '$lib/components/Stack.svelte';
	import Treemap from '$lib/components/Treemap.svelte';
	import Tip from '$lib/components/Tip.svelte';
	import { readRepo } from '$lib/atproto/read.js';
	import { buildStack, globalLayout, medianSession } from '$lib/portrait/layout.js';
	import { suggestGapMinutes } from '$lib/portrait/sessionize.js';
	import { defaults, fromHash, toHash, fmtDur } from '$lib/portrait/params.js';

	let handle = $state('');
	let params = $state(defaults());
	let view = $state('gate'); // gate | stack | map
	let weigh = $state('bytes');

	let data = $state(null);
	let glayout = $state(null);
	let status = $state('idle');
	let busy = $state(false);
	let message = $state(null);
	let error = $state(null);
	let hover = $state(null);
	let focusPlate = $state(null);

	let cam = $state(300);
	let ax = $state(-24);
	let ay = $state(32);
	let zoom = $state(0.55);
	let userZoomed = $state(false);
	let stack = $state(null);

	let ac = null;
	let pendingView = null;

	/* ---- the mapping, recomputed whenever a parameter moves ---- */
	const built = $derived(
		data && glayout ? buildStack(data.records, params, glayout) : { plates: [], stackDepth: 0 }
	);
	const legend = $derived(
		data ? [...glayout.shares.entries()].sort((a, b) => b[1] - a[1]) : []
	);
	const errors = $derived(data ? [...data.errorTally.entries()].sort((a, b) => b[1] - a[1]) : []);
	const stats = $derived.by(() => {
		if (!data || !built.plates.length) return null;
		const invalid = data.records.reduce((s, r) => s + (r.errs ? 1 : 0), 0);
		const silences = built.sessions.slice(-params.tiles).map((s) => s.silence);
		return {
			pds: new URL(data.pds).host,
			collections: data.collections.length,
			records: data.records.length,
			bytes: data.records.reduce((s, r) => s + (r.bytes || 0), 0),
			sessions: built.sessions.length,
			shown: built.shown,
			median: medianSession(built.sessions),
			longestSilence: fmtDur(Math.max(...silences, 0)),
			invalid,
			invalidPct: ((invalid / data.records.length) * 100).toFixed(2),
			first: new Date(data.records[0].ts).toISOString().slice(0, 10),
			truncated: data.truncated
		};
	});

	/* the whole state lives in the hash, so any portrait is reproducible */
	$effect(() => {
		if (!data) return;
		history.replaceState(null, '', toHash({ handle, view, params, cam, ax, ay }));
	});

	async function draw(who = null) {
		// take the handle explicitly when a caller has one: a two-way binding may
		// not have propagated by the time the select callback fires
		if (who) handle = who;
		if (!handle.trim()) return;
		if (ac) ac.abort();
		ac = new AbortController();
		const mine = ac;
		busy = true;
		error = null;
		hover = null;
		userZoomed = false;
		cam = 300;
		message = 'Resolving identity…';
		try {
			const d = await readRepo(handle, params.cap, mine.signal, (t) => {
				status = t;
				message = t;
			});
			if (mine.signal.aborted) return;
			glayout = globalLayout(d.records);
			data = d;
			// adaptive threshold: the finest granularity that still fits the
			// whole life inside the depth limit
			params.gap = suggestGapMinutes(d.records, params.tiles);
			status = 'drawn';
			view = pendingView || (view === 'gate' ? 'stack' : view);
			pendingView = null;
			message = null;
		} catch (err) {
			if (mine.signal.aborted) {
				status = 'stopped';
				message = null;
				return;
			}
			status = 'failed';
			message = null;
			error = String(err?.message ?? err);
		} finally {
			busy = false;
		}
	}

	function openRecord(d) {
		if (!data || !d?.col) return;
		const base = `https://pdsls.dev/at://${data.did}`;
		const url = d.rkey ? `${base}/${d.col}/${d.rkey}` : `${base}/${d.col}`;
		// a synthetic link, not window.open: passing a features string makes the
		// browser treat it as a popup, which pop-up blockers kill silently
		const a = document.createElement('a');
		a.href = url;
		a.target = '_blank';
		a.rel = 'noopener noreferrer';
		document.body.appendChild(a);
		a.click();
		a.remove();
	}

	function pick(v, who = null) {
		pendingView = v;
		draw(who);
	}

	// read the hash once on mount. Doing this in an $effect that both reads and
	// writes `params` is an unsafe mutation — it makes the effect its own
	// dependency and Svelte rejects it.
	onMount(() => {
		const h = fromHash(location.hash);
		params = h.params;
		if (h.cam != null) cam = h.cam;
		if (h.ax != null) ax = h.ax;
		if (h.ay != null) ay = h.ay;
		if (h.handle) {
			handle = h.handle;
			pendingView = h.view || 'stack';
			draw();
		}
	});
</script>

<svelte:head>
	<title>Stills &amp; Frames — atproto repo portraits</title>
	<meta
		name="description"
		content="Read any atproto repo and draw it: a rotatable stack of sessions in time, or a treemap of what the repo stores."
	/>
</svelte:head>

<div class="app" class:entry={view === 'gate'}>
	{#if view !== 'gate'}
		<Rail
			bind:handle
			bind:params
			{busy}
			{status}
			{stats}
			{legend}
			{errors}
			hueOf={glayout?.hueOf}
			ondraw={draw}
			onstop={() => ac?.abort()}
		/>
	{/if}

	<main class="stage">
		{#if view === 'gate'}
			<Gate bind:handle onpick={pick} />
		{:else if view === 'stack'}
			<Stack
				bind:this={stack}
				plates={built.plates}
				stackDepth={built.stackDepth}
				bind:cam
				bind:ax
				bind:ay
				bind:zoom
				bind:userZoomed
				onhover={(h) => (hover = h)}
				onfocus={(p) => (focusPlate = p)}
				onopen={openRecord}
			/>
		{:else}
			<Treemap
				records={data.records}
				hueOf={glayout.hueOf}
				bind:weigh
				onhover={(h) => (hover = h)}
				onopen={openRecord}
			/>
		{/if}

		{#if view !== 'gate' && glayout}
			<Tip info={hover ?? (view === 'stack' && focusPlate ? { plate: focusPlate } : null)} hueOf={glayout.hueOf} />
		{/if}

		{#if view === 'stack' && stats}
			<div class="hud">
				<div><b>{Math.hypot(ax, ay).toFixed(1)}</b><span>view angle °</span></div>
				<div><b>{stats.sessions}</b><span>sessions</span></div>
				<div><b>{stats.records}</b><span>records</span></div>
				<div>
					<b>{focusPlate ? new Date(focusPlate.start).toISOString().slice(0, 7) : '—'}</b>
					<span>you are at</span>
				</div>
			</div>
			<div class="state">
				<div class="st">
					{Math.hypot(ax, ay) < 1.2 ? 'frontal · this is the avatar' : 'oblique · this is the passage'}
				</div>
				<p class="sub">
					{Math.hypot(ax, ay) < 1.2
						? 'All of history collapsed into one square. Nothing about time is visible from here.'
						: 'Depth is silence. Twist is cadence. Each plate is one session.'}
				</p>
			</div>
		{/if}

		{#if view !== 'gate'}
			<div class="ctrls">
				<button class="ghost" onclick={() => (view = view === 'stack' ? 'map' : 'stack')}>
					{view === 'stack' ? 'GrandPerspective' : 'Stills & Frames'}
				</button>
				{#if view === 'stack'}
					<button class="ghost" onclick={() => stack?.home()}>Back to now</button>
					<button class="ghost" onclick={() => stack?.glide(0, 0)}>Frontal view</button>
					<button class="ghost" onclick={() => stack?.glide(-24, 32)}>Oblique</button>
				{/if}
			</div>
		{/if}

		{#if message}
			<div class="msg"><b>reading</b><p>{message}</p></div>
		{:else if error}
			<div class="msg">
				<b>cannot read that repo</b>
				<p>{error}.</p>
				<p class="fine">
					Likely causes: the handle does not resolve, or the PDS does not send CORS headers for
					browser reads. A self-hosted PDS needs <code>Access-Control-Allow-Origin</code> on
					<code>/xrpc/</code> for this to work from a page.
				</p>
			</div>
		{/if}
	</main>
</div>

<style>
	.app {
		display: grid;
		grid-template-columns: 300px 1fr;
		height: 100%;
	}
	.app.entry {
		grid-template-columns: 1fr;
	}
	.stage {
		position: relative;
		overflow: hidden;
		background: var(--ground);
	}
	.hud {
		position: absolute;
		left: 18px;
		bottom: 16px;
		font-family: 'IBM Plex Mono', monospace;
		display: flex;
		gap: 18px;
		align-items: flex-end;
		pointer-events: none;
		color: var(--ink-soft);
	}
	.hud b {
		display: block;
		font-size: 26px;
		font-weight: 500;
		color: var(--ink);
		line-height: 0.9;
		letter-spacing: -0.02em;
	}
	.hud span {
		font-size: 9px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	.state {
		position: absolute;
		right: 18px;
		top: 16px;
		text-align: right;
		pointer-events: none;
		max-width: 240px;
	}
	.state .st {
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
	}
	.state .sub {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 9.5px;
		color: var(--ink-soft);
		margin: 4px 0 0;
	}
	.ctrls {
		position: absolute;
		right: 18px;
		bottom: 16px;
		display: flex;
		gap: 6px;
		z-index: 6;
	}
	.ctrls button {
		font-family: 'Archivo', sans-serif;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		padding: 9px 10px;
		border: 1px solid var(--ink);
		background: var(--paper);
		color: var(--ink);
		cursor: pointer;
	}
	.ctrls button:hover {
		background: var(--ink);
		color: var(--paper);
	}
	.msg {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		max-width: 420px;
		text-align: center;
		font-size: 12px;
		line-height: 1.5;
		/* the portrait behind can be any colour, so the panel carries its own */
		background: var(--paper);
		border: 1px solid var(--rule);
		padding: 14px 18px;
		z-index: 7;
	}
	.msg b {
		display: block;
		font-weight: 800;
		letter-spacing: -0.02em;
		font-size: 15px;
		margin-bottom: 6px;
		text-transform: uppercase;
	}
	.msg p {
		margin: 0;
		color: var(--ink-soft);
	}
	.msg .fine {
		margin-top: 8px;
		font-size: 11px;
	}
	code {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 11px;
		background: var(--ground-deep);
		padding: 1px 4px;
	}
	@media (max-width: 820px) {
		.app {
			grid-template-columns: 1fr;
			grid-template-rows: auto 1fr;
		}
	}
</style>
