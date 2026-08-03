<script>
	/**
	 * One-line banner shown above the firehose when the connection is
	 * slow (or saveData is on) AND a read is in progress AND the user
	 * has not dismissed it for the session. A dismissable banner is
	 * not the place for a hard block; the gate's "can use tens of MB"
	 * fact is what handles pre-consent -- this is a last-mile reminder
	 * for users who pressed Read and then noticed the bytes climbing.
	 *
	 * The firehose already shows the byte counter; this banner sits
	 * above it without pretending the user can't see what they're
	 * spending. Copy stays factual, no alarm emoji, no dramatic
	 * punctuation.
	 */
	/** @type {{ visible?: boolean, ondismiss?: () => void }} */
	let { visible = false, ondismiss = () => {} } = $props();
</script>

{#if visible}
	<div class="wifi" role="status" aria-live="polite">
		<span>
			Reading a PDS can use tens of MB. Switch to wifi to avoid data charges.
		</span>
		<button onclick={ondismiss}>Continue anyway</button>
	</div>
{/if}

<style>
	.wifi {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 14px;
		background: var(--paper);
		border: 1px solid var(--ink);
		border-left-width: 2px;
		font-family: 'IBM Plex Mono', monospace;
		font-size: 11px;
		line-height: 1.4;
		color: var(--ink);
	}
	.wifi span { flex: 1; }
	.wifi button {
		flex: none;
		font-family: 'Archivo', sans-serif;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		padding: 8px 12px;
		min-height: 36px;
		border: 1px solid var(--ink);
		background: transparent;
		color: var(--ink);
		cursor: pointer;
	}
	.wifi button:hover { background: var(--ink); color: var(--paper); }

	@media (max-width: 820px) {
		.wifi { padding: 10px 12px; gap: 10px; }
		.wifi button { min-height: 44px; }
		.wifi { flex-wrap: wrap; }
	}
</style>
