<script>
	import { onMount } from 'svelte';
	import {
		MICROBLOGGING_OPTS,
		VIEWER_OPTS,
		loadPreferences,
		savePreferences
	} from '$lib/preferences.js';

	// Initialize from localStorage
	let microblogging = $state('bsky');
	let viewer = $state('pdsls.dev');
	let saved = $state(false);

	onMount(() => {
		const prefs = loadPreferences();
		microblogging = prefs.microblogging;
		viewer = prefs.viewer;
	});

	async function save() {
		saved = false;
		try {
			const prefs = savePreferences({ microblogging, viewer });
			microblogging = prefs.microblogging;
			viewer = prefs.viewer;
			saved = true;
			setTimeout(() => (saved = false), 3000);
		} catch (/** @type {any} */ err) {
			// Silently ignore save errors
		}
	}
</script>

<div class="preferences">
	<h2>Preferences</h2>

	<div class="section">
		<label class="lbl" for="pref-microblogging">Microblogging App</label>
		<select id="pref-microblogging" bind:value={microblogging}>
			{#each MICROBLOGGING_OPTS as opt (opt.id)}
				<option value={opt.id}>{opt.label}</option>
			{/each}
		</select>
		<span class="hint">Choose your preferred microblogging platform</span>
	</div>

	<div class="section">
		<label class="lbl" for="pref-viewer">Record Viewer</label>
		<select id="pref-viewer" bind:value={viewer}>
			{#each VIEWER_OPTS as opt (opt.id)}
				<option value={opt.id}>{opt.label}</option>
			{/each}
		</select>
		<span class="hint">Choose your preferred record viewer</span>
	</div>

	<div class="actions">
		<button onclick={save}>
			Save Preferences
		</button>
		{#if saved}
			<span class="saved">Saved!</span>
		{/if}
	</div>
</div>

<style>
	.preferences {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 11px;
		color: var(--ink);
		background: var(--paper);
		border: 1px solid var(--rule);
		padding: 16px;
		margin-top: 12px;
	}

	.preferences h2 {
		font-family: 'Archivo', sans-serif;
		font-size: 13px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		margin: 0 0 14px 0;
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
		font-family: 'IBM Plex Mono', monospace;
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
		font-family: 'Archivo', sans-serif;
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
