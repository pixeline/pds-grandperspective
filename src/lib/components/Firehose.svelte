<script>
	import { fmtBytes, fmtNum } from '$lib/repo/format.js';

	let {
		phase = 'resolving',
		bytes = 0,
		records = 0,
		collections = 0,
		lines = [],
		elapsed = 0
	} = $props();

	const secs = $derived(Math.max(elapsed / 1000, 0.001));
	const recPerSec = $derived(records > 0 ? Math.round(records / secs) : 0);
	const kbPerSec = $derived(bytes > 0 ? Math.round(bytes / 1024 / secs) : 0);

	const label = $derived(
		{
			resolving: 'resolving identity',
			receiving: 'receiving',
			parsing: 'parsing',
			listing: 'listing records'
		}[phase] ?? phase
	);

	const hhmmss = (ts) => new Date(ts).toISOString().slice(11, 19);
</script>

<div class="fh">
	<div class="stream" aria-hidden="true">
		{#each lines as l (l.rkey + l.col)}
			<div class="ln">
				<span class="t">{hhmmss(l.ts)}</span>
				<span class="c">{l.col}</span>
				<span class="k">{l.rkey}</span>
				<span class="b">{l.bytes} B</span>
			</div>
		{/each}
	</div>

	<div class="read" role="status" aria-live="polite">
		<div class="phase">{label}</div>
		<dl>
			<div><dt>records</dt><dd>{fmtNum(records)}</dd></div>
			<div><dt>bytes</dt><dd>{fmtBytes(bytes)}</dd></div>
			<div><dt>collections</dt><dd>{collections}</dd></div>
			<div><dt>rec/s</dt><dd>{fmtNum(recPerSec)}</dd></div>
			<div><dt>KB/s</dt><dd>{fmtNum(kbPerSec)}</dd></div>
			<div><dt>elapsed</dt><dd>{secs.toFixed(1)} s</dd></div>
		</dl>
	</div>
</div>

<style>
	.fh {
		position: absolute;
		inset: 0;
		display: grid;
		grid-template-columns: 1fr auto;
		align-items: end;
		gap: 32px;
		padding: 32px;
		background: var(--ground);
		font-family: 'IBM Plex Mono', monospace;
		overflow: hidden;
	}
	.stream {
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		height: 100%;
		overflow: hidden;
		font-size: 10.5px;
		line-height: 1.55;
		color: var(--ink-soft);
	}
	.ln {
		display: grid;
		grid-template-columns: 68px minmax(0, 1fr) 116px 72px;
		gap: 14px;
		white-space: nowrap;
	}
	/* the newest lines are the legible ones; older ones recede */
	.ln:nth-last-child(n + 12) { opacity: 0.35; }
	.ln:nth-last-child(-n + 3) { color: var(--ink); }
	.c { overflow: hidden; text-overflow: ellipsis; }
	.k, .b { text-align: right; }
	.read { text-align: right; }
	.phase {
		font-family: 'Archivo', sans-serif;
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--ink-soft);
		margin-bottom: 14px;
	}
	dl { margin: 0; display: flex; flex-direction: column; gap: 8px; }
	dl > div { display: grid; grid-template-columns: auto 128px; gap: 16px; align-items: baseline; }
	dt {
		font-family: 'Archivo', sans-serif;
		font-size: 8.5px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-soft);
	}
	dd { margin: 0; font-size: 22px; font-weight: 500; letter-spacing: -0.02em; }
	@media (prefers-reduced-motion: reduce) {
		.ln:nth-last-child(n + 12) { opacity: 1; }
	}
</style>
