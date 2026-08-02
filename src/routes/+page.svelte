<script>
	import { onMount } from 'svelte';
	import Gate from '$lib/components/Gate.svelte';
	import Rail from '$lib/components/Rail.svelte';
	import Treemap from '$lib/components/Treemap.svelte';
	import Firehose from '$lib/components/Firehose.svelte';
	import RecordModal from '$lib/components/RecordModal.svelte';
	import Tip from '$lib/components/Tip.svelte';
	import { readRepo } from '$lib/atproto/read.js';
	import { createSessionStore } from '$lib/atproto/session.svelte.js';
	import { collectionHues } from '$lib/repo/hues.js';
	import { applyFilters } from '$lib/repo/filter.js';
	import { defaultState, fromHash, toHash } from '$lib/repo/urlstate.js';

	const session = createSessionStore();

	let handle = $state('');
	let weigh = $state('bytes');
	let filters = $state({ collections: new Set(), from: null, to: null, query: '' });

	let data = $state(null);
	let hues = $state(null);
	let status = $state('idle');
	let busy = $state(false);
	let error = $state(null);
	let hover = $state(null);
	let selected = $state(null);
	let entered = $state(false);

	// firehose state
	let phase = $state('resolving');
	let gotBytes = $state(0);
	let gotRecords = $state(0);
	let lines = $state([]);
	let startedAt = $state(0);
	let elapsed = $state(0);

	let ac = null;
	let ticker = null;

	const filtered = $derived(data ? applyFilters(data.records, filters) : null);
	const legend = $derived(
		hues ? [...hues.shares.entries()].sort((a, b) => b[1] - a[1]) : []
	);
	const errors = $derived(data ? [...data.errorTally.entries()].sort((a, b) => b[1] - a[1]) : []);
	const isOwnRepo = $derived(!!session.did && !!data && session.did === data.did);

	const stats = $derived.by(() => {
		if (!data || !filtered) return null;
		const invalid = data.records.reduce((s, r) => s + (r.errs ? 1 : 0), 0);
		return {
			pds: new URL(data.pds).host,
			collections: data.collections.length,
			records: data.records.length,
			matched: filtered.matched,
			bytes: filtered.totalBytes,
			exact: data.exact,
			rev: data.rev,
			invalid,
			invalidPct: data.records.length
				? ((invalid / data.records.length) * 100).toFixed(2)
				: '0.00',
			// undated records sort last, but do not depend on position: scan for
			// the earliest record that actually has a timestamp
			first: (() => {
				let earliest = null;
				for (const r of data.records) {
					if (r.ts != null && (earliest == null || r.ts < earliest)) earliest = r.ts;
				}
				return earliest == null ? '—' : new Date(earliest).toISOString().slice(0, 10);
			})(),
			undated: data.records.reduce((s, r) => s + (r.ts == null ? 1 : 0), 0)
		};
	});

	$effect(() => {
		if (!data && !handle) return;
		history.replaceState(null, '', toHash({ ...defaultState(), handle, weigh, ...filters }));
	});

	async function draw(who = null) {
		// take the handle explicitly: a two-way binding may not have propagated
		// by the time a select callback fires
		if (who) handle = who;
		if (!handle.trim()) return;

		ac?.abort();
		ac = new AbortController();
		const mine = ac;

		busy = true;
		entered = true;
		error = null;
		hover = null;
		selected = null;
		gotBytes = 0;
		gotRecords = 0;
		lines = [];
		phase = 'resolving';
		startedAt = Date.now();
		elapsed = 0;
		clearInterval(ticker);
		ticker = setInterval(() => (elapsed = Date.now() - startedAt), 100);

		try {
			const d = await readRepo(handle, {
				signal: mine.signal,
				onProgress: (e) => {
					phase = e.phase;
					status = e.message;
					if (e.bytes != null) gotBytes = e.bytes;
					if (e.records != null) gotRecords = e.records;
				},
				onSizeGate: async (bytes) =>
					confirm(
						`Read so far: ${(bytes / 1048576).toFixed(0)} MB.\n\n` +
							`This repository is unusually large and will use roughly 4x that in memory.\n\n` +
							`Continue reading?`
					)
			});
			if (mine.signal.aborted) return;

			hues = collectionHues(d.records);
			data = d;
			gotRecords = d.records.length;
			// the firehose showed real records; end on the true final lines
			lines = d.records.slice(-24).map((r) => ({
				ts: r.ts, col: r.col, rkey: r.rkey, bytes: r.bytes
			}));
			status = d.exact ? 'read complete (measured)' : 'read complete (estimated)';
		} catch (err) {
			if (mine.signal.aborted) {
				status = 'stopped';
				return;
			}
			status = 'failed';
			error =
				String(err?.message) === 'size-limit'
					? 'Stopped: the repository exceeded the size limit and reading was declined.'
					: String(err?.message ?? err);
		} finally {
			busy = false;
			clearInterval(ticker);
		}
	}

	function onchanged({ action, record, value }) {
		if (!data) return;
		let records = data.records;
		if (action === 'deleted') {
			records = records.filter((r) => r.rkey !== record.rkey || r.col !== record.col);
		} else if (action === 'updated') {
			records = records.map((r) =>
				r.rkey === record.rkey && r.col === record.col
					? { ...r, value, bytes: JSON.stringify(value).length, exact: false }
					: r
			);
		}
		// data.exact is the aggregate "measured (CAR) / estimated" label the Rail
		// shows; each record already carries its own exact flag (true from the
		// CAR, false from listRecords or a local edit -- see list.js and above).
		// Recompute it from the records rather than leaving it pinned to
		// whatever the initial read was, or an edit after a fully-measured CAR
		// read would still claim everything is measured.
		data = { ...data, records, exact: records.every((r) => r.exact !== false) };
		hues = collectionHues(data.records);
	}

	onMount(async () => {
		// the OAuth callback arrives as ?code=…&state=… on this same route, so it
		// MUST be resolved before the hash is read or the redirect races the
		// state restore
		await session.init();

		const s = fromHash(location.hash);
		handle = s.handle;
		weigh = s.weigh;
		filters = { collections: s.collections, from: s.from, to: s.to, query: s.query };
		if (s.handle) draw();
	});
</script>

<svelte:head>
	<title>GrandPerspective — PDS edition</title>
	<meta
		name="description"
		content="See where an atproto repository's bytes actually go, and act on what you find."
	/>
</svelte:head>

<div class="app" class:entry={!entered}>
	{#if entered}
		<Rail
			bind:handle
			bind:filters
			{busy}
			{status}
			{stats}
			{legend}
			{errors}
			hueOf={hues?.hueOf}
			{session}
			ondraw={draw}
			onstop={() => ac?.abort()}
			onsignin={(h) => session.signIn(h)}
			onsignout={() => session.signOut()}
		/>
	{/if}

	<main class="stage">
		{#if !entered}
			<Gate bind:handle onpick={(who) => draw(who)} />
		{:else if busy}
			<Firehose
				{phase}
				bytes={gotBytes}
				records={gotRecords}
				collections={data?.collections.length ?? 0}
				{lines}
				{elapsed}
			/>
		{:else if data && hues && filtered}
			<Treemap
				records={filtered.records}
				hueOf={hues.hueOf}
				bind:weigh
				exact={data.exact}
				onhover={(h) => (hover = h)}
				onopen={(h) => (selected = h)}
			/>
			<Tip info={hover} hueOf={hues.hueOf} />
		{/if}

		{#if error}
			<div class="msg">
				<b>cannot read that repository</b>
				<p>{error}</p>
				<p class="fine">
					If the handle resolves, the likely cause is CORS: a PDS must send
					<code>Access-Control-Allow-Origin</code> on <code>/xrpc/</code> for a browser to read it.
				</p>
			</div>
		{/if}
	</main>
</div>

<RecordModal
	record={selected}
	did={data?.did}
	agent={session.agent}
	canWrite={session.canWrite}
	{isOwnRepo}
	onclose={() => (selected = null)}
	{onchanged}
/>

<style>
	.app { display: grid; grid-template-columns: 320px 1fr; height: 100%; }
	.app.entry { grid-template-columns: 1fr; }
	.stage { position: relative; overflow: hidden; background: var(--ground); }
	.msg {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		max-width: 440px;
		text-align: center;
		font-size: 12px;
		line-height: 1.5;
		background: var(--paper);
		border: 1px solid var(--rule);
		padding: 16px 20px;
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
	.msg p { margin: 0; color: var(--ink-soft); }
	.msg .fine { margin-top: 8px; font-size: 11px; }
	code {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 11px;
		background: var(--ground-deep);
		padding: 1px 4px;
	}
	@media (max-width: 820px) {
		.app { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
	}
</style>
