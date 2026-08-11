<script>
	import { onMount } from 'svelte';
	import { PREF_GROUPS, optionsFor, loadPreferences, savePreferences } from '$lib/preferences.js';

	/** Selected waypoint id per group, keyed by group id. */
	let selection = $state(/** @type {Record<string, string>} */ ({}));
	let saved = $state(false);

	// Options are fixed for the session (the catalog doesn't change at runtime).
	const GROUPS = PREF_GROUPS.map((g) => ({ ...g, options: optionsFor(g.id) }));

	onMount(() => {
		selection = loadPreferences();
	});

	async function save() {
		saved = false;
		try {
			selection = savePreferences(selection);
			saved = true;
			setTimeout(() => (saved = false), 3000);
		} catch (/** @type {any} */ err) {
			// Silently ignore save errors
		}
	}
</script>

<div class="preferences">
	{#each GROUPS as group (group.id)}
		<div class="section">
			<label class="lbl" for={`pref-${group.id}`}>{group.label}</label>
			<select id={`pref-${group.id}`} bind:value={selection[group.id]}>
				{#each group.options as opt (opt.id)}
					<option value={opt.id}>{opt.name}</option>
				{/each}
			</select>
			<span class="hint">{group.hint}</span>
		</div>
	{/each}

	<div class="actions">
		<button onclick={save}>Save Preferences</button>
		{#if saved}
			<span class="saved">Saved!</span>
		{/if}
	</div>
</div>

<style>
	/* No border/background: the sidebar separates sections with horizontal
	   rules, not boxes. The collapsible "Preferences" summary in Rail is the
	   only heading -- the component adds none of its own. */
	.preferences {
		font-family: 'JetBrains Mono', monospace;
		font-size: 11px;
		color: var(--ink);
	}

	.preferences .section {
		margin-bottom: 14px;
	}

	.preferences .lbl {
		display: block;
		font-weight: 600;
		margin-bottom: 4px;
		color: var(--ink);
	}

	.preferences select {
		width: 100%;
		max-width: 300px;
		padding: 6px 10px;
		font-family: 'JetBrains Mono', monospace;
		font-size: 11px;
		border: 1px solid var(--ink);
		background: var(--paper);
		color: var(--ink);
		cursor: pointer;
	}

	.preferences select:hover {
		background: var(--ground);
	}

	.preferences select:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.preferences .hint {
		font-size: 10px;
		color: var(--ink-soft);
		display: block;
		margin-top: 3px;
	}

	.preferences .actions {
		margin-top: 16px;
		display: flex;
		gap: 10px;
		align-items: center;
	}

	.preferences button {
		font-family: 'Inter', sans-serif;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		padding: 8px 14px;
		min-height: 36px;
		border: 1px solid var(--ink);
		background: transparent;
		color: var(--ink);
		cursor: pointer;
	}

	.preferences button:hover:not(:disabled) {
		background: var(--ink);
		color: var(--paper);
	}

	.preferences button:disabled {
		opacity: 0.35;
		cursor: default;
	}

	.preferences .saved {
		color: var(--ink);
		font-size: 10px;
	}
</style>
