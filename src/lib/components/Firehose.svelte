<script>
	import { fmtBytes, fmtNum } from '$lib/repo/format.js';

	let {
		phase = 'resolving',
		bytes = 0,
		records = 0,
		collections = 0,
		lines = [],
		lastCol = null,
		elapsed = 0
	} = $props();

	// Live colour for the loader, taken from the last lexicon streamed in.
	// hues.js assigns a collection's hue by a golden-angle walk over the
	// ALPHABETICALLY sorted *full* collection set. Mid-read we don't have the
	// full set, so we walk the collections seen so far the same way: the colour
	// evolves as new lexicons arrive and, once the last ones land, converges on
	// exactly the hues the treemap will paint. `seen` is per-read -- this
	// component mounts fresh each time a read starts.
	const seen = new Set();
	let hue = $state(/** @type {number | null} */ (null));
	$effect(() => {
		const c = lastCol;
		if (!c) return;
		seen.add(c);
		hue = ([...seen].sort().indexOf(c) * 137.507) % 360;
	});

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

	// An undated record (no decodable TID, no createdAt) has no real time to
	// show -- `new Date(null)` silently renders 1970-01-01 as "00:00:00",
	// the exact fake-timestamp pattern the `ts: null` decision elsewhere in
	// this branch exists to eliminate. Say so honestly instead of inventing one.
	const hhmmss = (ts) => (ts == null ? '—' : new Date(ts).toISOString().slice(11, 19));
</script>

<div class="fh">
	<!-- A big, gently breathing block at dead center: the focal "reading…"
	     indicator. Neutral by design -- hue belongs to the data, not the
	     chrome -- and a square because the whole tool is rectangles. It is
	     functional feedback (it says "working"), not ornament, which is why it
	     earns the one bit of motion the design otherwise forbids; under
	     prefers-reduced-motion it holds still at a visible opacity. -->
	<div class="loader" aria-hidden="true">
		<div
			class="pulse"
			class:colored={hue != null}
			style={hue != null ? `background: hsl(${hue} 74% 52%)` : ''}
		></div>
		<div class="pulse-label">{label}</div>
		{#if lastCol}
			<div class="pulse-col">{lastCol}</div>
		{/if}
	</div>

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
		font-family: 'JetBrains Mono', monospace;
		overflow: hidden;
	}
	/* Centered focal loader, above the log/counters but non-interactive. */
	.loader {
		position: absolute;
		inset: 0;
		z-index: 2;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 18px;
		pointer-events: none;
	}
	.pulse {
		width: clamp(120px, 24vmin, 220px);
		aspect-ratio: 1 / 1;
		background: var(--ink);
		/* --lo/--hi are the breathe range. Neutral (no block yet) stays a subtle
		   grey; once a lexicon's colour lands the range lifts so the hue reads. */
		--lo: 0.08;
		--hi: 0.2;
		opacity: var(--hi);
		animation: breathe 1.7s ease-in-out infinite;
		/* ease between one lexicon's colour and the next rather than snapping */
		transition: background-color 0.55s ease;
		will-change: opacity, transform;
	}
	.pulse.colored {
		--lo: 0.55;
		--hi: 0.9;
	}
	.pulse-label {
		font-family: 'Inter', sans-serif;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--ink-soft);
	}
	.pulse-col {
		font-family: 'JetBrains Mono', monospace;
		font-size: 12px;
		color: var(--ink);
		max-width: min(80vw, 420px);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	@keyframes breathe {
		0%,
		100% {
			opacity: var(--lo);
			transform: scale(0.96);
		}
		50% {
			opacity: var(--hi);
			transform: scale(1);
		}
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
		font-family: 'Inter', sans-serif;
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
		font-family: 'Inter', sans-serif;
		font-size: 8.5px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-soft);
	}
	dd { margin: 0; font-size: 22px; font-weight: 500; letter-spacing: -0.02em; }
	@media (prefers-reduced-motion: reduce) {
		.ln:nth-last-child(n + 12) { opacity: 1; }
		/* Hold the loader still at a clearly visible weight rather than freezing
		   it mid-breath at a faint keyframe. */
		.pulse { animation: none; opacity: 0.16; transform: none; }
		.pulse.colored { opacity: 0.82; }
	}

	/* Side by side, the two halves need ~300px of log line plus ~200px of
	   counters: on a 390px phone the counters were pushed half off the right
	   edge, so `records`, `bytes` and the rest read as cut-off digits. Stack
	   them -- log above, counters below -- and let the counters wrap into rows
	   instead of one tall column. */
	@media (max-width: 820px) {
		.fh {
			grid-template-columns: 1fr;
			/* minmax(0,1fr) not 1fr: the stream is a fixed-height overflow
			   container, and an auto-minimum track would size to its content
			   and push the counters off screen. */
			grid-template-rows: minmax(0, 1fr) auto;
			gap: 16px;
			padding: 16px max(16px, env(safe-area-inset-right)) calc(16px + env(safe-area-inset-bottom))
				max(16px, env(safe-area-inset-left));
		}
		.ln {
			grid-template-columns: 50px minmax(0, 1fr) minmax(0, 76px) 52px;
			gap: 7px;
			font-size: 9.5px;
		}
		.k { overflow: hidden; text-overflow: ellipsis; }
		.read { text-align: left; }
		.phase { margin-bottom: 10px; }
		dl { flex-direction: row; flex-wrap: wrap; gap: 8px 20px; }
		dl > div { grid-template-columns: auto auto; gap: 7px; }
		dd { font-size: 17px; }
	}
</style>
