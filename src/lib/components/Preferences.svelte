<script>
	import { MICROBLOGGING_OPTS, VIEWER_OPTS, PREFERENCES_COLLECTION, PREFERENCES_RKEY, createPreferences, readPreferences } from '$lib/preferences.js';
	import { putRecord } from '$lib/atproto/write.js';

	let { session } = $props();

	let microblogging = $state('bsky');
	let viewer = $state('pdsls.dev');
	let saving = $state(false);
	let saveError = $state(null);
	let saved = $state(false);
	let loading = $state(false);

	// Load existing preferences if available
	$effect(() => {
		if (!session.did || !session.agent) return;
		
		async function load() {
			loading = true;
			try {
				const prefs = await readPreferences(session.agent, session.did);
				if (prefs) {
					microblogging = prefs.microblogging;
					viewer = prefs.viewer;
				}
			} catch (/** @type {any} */ err) {
				// Silently ignore - will use defaults
			} finally {
				loading = false;
			}
		}
		load();
	});

	async function save() {
		if (!session.did || !session.agent) {
			saveError = 'Please sign in to save preferences';
			return;
		}

		saving = true;
		saveError = null;

		try {
			const prefs = createPreferences(microblogging, viewer);
			await putRecord(session, {
				did: session.did,
				col: PREFERENCES_COLLECTION,
				rkey: PREFERENCES_RKEY,
				value: prefs
			});
			saved = true;
			setTimeout(() => (saved = false), 3000);
		} catch (/** @type {any} */ err) {
			saveError = String(err?.message ?? err);
		} finally {
			saving = false;
		}
	}
</script>

<div class="preferences">
	<h2>Preferences</h2>

	<div class="section">
		<label class="lbl">Microblogging App</label>
		<select bind:value={microblogging} disabled={saving}>
			{#each MICROBLOGGING_OPTS as opt (opt.id)}
				<option value={opt.id}>{opt.label}</option>
			{/each}
		</select>
		<span class="hint">Choose your preferred microblogging platform</span>
	</div>

	<div class="section">
		<label class="lbl">Record Viewer</label>
		<select bind:value={viewer} disabled={saving}>
			{#each VIEWER_OPTS as opt (opt.id)}
				<option value={opt.id}>{opt.label}</option>
			{/each}
		</select>
		<span class="hint">Choose your preferred record viewer</span>
	</div>

	{#if session.did}
		{#if loading}
			<span class="loading">Loading preferences...</span>
		{:else}
			<div class="actions">
				<button onclick={save} disabled={saving}>
					{saving ? 'Saving...' : 'Save Preferences'}
				</button>
				{#if saved}
					<span class="saved">Saved!</span>
				{/if}
				{#if saveError}
					<span class="error">{saveError}</span>
				{/if}
			</div>
		{/if}
	{:else}
		<p class="signin-prompt">Sign in to save your preferences.</p>
	{/if}
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

	.preferences .error {
		color: var(--ink);
		font-size: 10px;
		border-left: 2px solid var(--ink);
		padding-left: 6px;
	}

	.preferences .signin-prompt {
		font-size: 10px;
		color: var(--ink-soft);
		margin: 0;
	}

	.preferences .loading {
		font-size: 10px;
		color: var(--ink-soft);
		font-style: italic;
	}
</style>
