<script>
	import { fmtBytes, fmtDate } from '$lib/repo/format.js';

	/** @type {{info:any, hueOf:Map<string,number>}} */
	let { info, hueOf } = $props();
</script>

{#if info}
	<div class="tip">
		<div class="t">{info.aggregate ? 'collection' : 'record'}</div>
		<table>
			<tbody>
				<tr><td class="k">collection</td><td class="v">{info.col ?? info.nsid}</td></tr>
				{#if info.aggregate}
					<tr><td class="k">records</td><td class="v">{info.records}</td></tr>
				{/if}
				{#if info.rkey}<tr><td class="k">rkey</td><td class="v">{info.rkey}</td></tr>{/if}
				{#if info.ts != null}
					<tr><td class="k">timestamp</td><td class="v">{fmtDate(info.ts)}</td></tr>
				{:else if info.undated}
					<tr><td class="k">timestamp</td><td class="v">undated — no TID or createdAt</td></tr>
				{/if}
				{#if info.bytes}<tr><td class="k">stored</td><td class="v">{fmtBytes(info.bytes)}</td></tr>{/if}
				{#if info.err}<tr><td class="k">invalid</td><td class="v">{info.err}</td></tr>{/if}
			</tbody>
		</table>
		<p class="hint">click → open record</p>
	</div>
{/if}

<style>
	.tip {
		position: absolute;
		right: 18px;
		top: 104px;
		/* A touch never opens this (Treemap ignores hover from a touch pointer),
		   but a narrow window with a real pointer does -- a phone-sized browser
		   on a desktop, or a tablet with a trackpad -- and a fixed 262px would
		   hang off the edge there. */
		width: min(262px, calc(100% - 36px));
		background: var(--paper);
		border: 1px solid var(--rule);
		padding: 10px 12px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		pointer-events: none;
		z-index: 5;
	}
	.t {
		font-weight: 800;
		font-size: 11px;
		letter-spacing: 0.02em;
		text-transform: uppercase;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-family: 'JetBrains Mono', monospace;
		font-size: 10px;
	}
	td {
		padding: 2px 0;
		vertical-align: top;
	}
	td.k {
		color: var(--ink-soft);
	}
	td.v {
		text-align: right;
		font-weight: 500;
		word-break: break-all;
	}
	.hint {
		font-size: 9px;
		letter-spacing: 0.04em;
		color: var(--ink-soft);
		font-style: italic;
		margin: 0;
	}
</style>
