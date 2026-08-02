<script>
	import { validateEdit, putRecord, deleteRecord } from '$lib/atproto/write.js';
	import { fmtBytes, fmtDate } from '$lib/repo/format.js';
	import { tidToMs } from '$lib/atproto/tid.js';

	let {
		record = null,
		did = null,
		agent = null,
		canWrite = false,
		isOwnRepo = false,
		onclose,
		onchanged
	} = $props();

	let editing = $state(false);
	let confirming = $state(false);
	let text = $state('');
	/** @type {string|null} */
	let problem = $state(null);
	let busy = $state(false);

	// Instance state (confirming/editing/text/problem) belongs to whichever
	// record last touched it. Task 18 mounts this modal once and swaps the
	// `record` prop rather than destroying the instance between records, so
	// nothing here resets on its own. Track the record's identity in a plain
	// (non-reactive) variable and reset per-record state whenever it changes
	// -- including transitions to and from null, which is what makes closing
	// the modal (by any path) also clear a stale `confirming`/`editing`.
	// Without this, confirming a delete on record A and then opening record B
	// lands straight on "Confirm delete" for B, and an in-progress edit of A
	// leaves A's text sitting in the textarea under B's header.
	/** @type {string|null} */
	let lastKey = null;
	$effect(() => {
		const key = record ? `${record.col}/${record.rkey}` : null;
		if (key === lastKey) return;
		lastKey = key;
		confirming = false;
		editing = false;
		text = '';
		problem = null;
	});

	const writable = $derived(isOwnRepo && canWrite && !!agent && !record?.aggregate);

	const tidTime = $derived(record?.rkey ? tidToMs(record.rkey) : null);
	const claimed = $derived(
		record?.value?.createdAt ? Date.parse(record.value.createdAt) : null
	);
	// the TID is server-assigned, createdAt is user-claimed; a disagreement is
	// information, not noise, so it is shown rather than resolved away
	const skewed = $derived(
		tidTime != null && claimed != null && Math.abs(tidTime - claimed) > 864e5
	);

	const readOnlyReason = $derived(
		record?.aggregate
			? 'This block is too small to resolve to one record.'
			: !agent
				? 'Sign in to edit your own records.'
				: !isOwnRepo
					? 'You can only edit records in your own repository.'
					: !canWrite
						? 'Your authorization server did not grant repository write access.'
						: null
	);

	function startEdit() {
		text = JSON.stringify(record.value, null, 2);
		problem = null;
		editing = true;
	}

	async function save() {
		// Capture the record this write is about at the moment it starts. The
		// write is async; `record` is a live prop that can change under us
		// while the request is in flight (the parent can select a different
		// cell), so every reference below must use this local, not the prop.
		const target = record;
		const check = validateEdit(target.value, text);
		if (!check.ok) {
			problem = check.reason;
			return;
		}
		busy = true;
		problem = null;
		try {
			await putRecord(agent, { did, col: target.col, rkey: target.rkey, value: check.value });
			onchanged?.({ action: 'updated', record: target, value: check.value });
			editing = false;
		} catch (/** @type {any} */ e) {
			// surface the XRPC error verbatim and leave local state untouched
			problem = String(e?.message ?? e);
		} finally {
			busy = false;
		}
	}

	async function remove() {
		// Same reasoning as save(): pin the record this delete targets before
		// awaiting, so a mid-flight selection change can't misattribute the
		// result to whatever happens to be selected when the response lands.
		const target = record;
		busy = true;
		problem = null;
		try {
			await deleteRecord(agent, { did, col: target.col, rkey: target.rkey });
			onchanged?.({ action: 'deleted', record: target });
			onclose?.();
		} catch (/** @type {any} */ e) {
			problem = String(e?.message ?? e);
			confirming = false;
		} finally {
			busy = false;
		}
	}

	function pdsls() {
		const url = `https://pdsls.dev/at://${did}/${record.col}/${record.rkey}`;
		// a synthetic link, not window.open: a features string makes it a popup,
		// which blockers kill silently
		const a = document.createElement('a');
		a.href = url;
		a.target = '_blank';
		a.rel = 'noopener noreferrer';
		document.body.appendChild(a);
		a.click();
		a.remove();
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && !busy && onclose?.()} />

{#if record}
	<div
		class="scrim"
		role="button"
		tabindex="-1"
		aria-label="Close"
		onclick={() => !busy && onclose?.()}
		onkeydown={(e) => e.key === 'Enter' && !busy && onclose?.()}
	></div>

	<div class="modal" role="dialog" aria-modal="true" aria-label="Record {record.rkey}">
		<header>
			<h2>{record.col}</h2>
			<button class="x" onclick={() => onclose?.()} aria-label="Close" disabled={busy}>close</button>
		</header>

		<dl class="meta">
			<div><dt>rkey</dt><dd>{record.rkey ?? '—'}</dd></div>
			<div><dt>stored</dt><dd>{fmtBytes(record.bytes ?? 0)}</dd></div>
			{#if tidTime != null}
				<div><dt>tid time</dt><dd>{fmtDate(tidTime)}</dd></div>
			{/if}
			{#if claimed != null}
				<div class:skew={skewed}>
					<dt>createdAt</dt>
					<dd>{fmtDate(claimed)}{skewed ? ' — disagrees with the TID' : ''}</dd>
				</div>
			{/if}
			{#if record.err}
				<div><dt>errors</dt><dd>{record.err}</dd></div>
			{/if}
		</dl>

		{#if record.aggregate}
			<p class="note">
				{record.records} records, {fmtBytes(record.bytes)}. This block is drawn whole because its
				cells would be smaller than a pixel — no single record is being shown.
			</p>
		{:else if editing}
			<textarea bind:value={text} spellcheck="false" aria-label="Record JSON"></textarea>
		{:else}
			<pre>{JSON.stringify(record.value, null, 2)}</pre>
		{/if}

		{#if problem}
			<p class="problem">{problem}</p>
		{/if}

		<footer>
			<button class="ghost" onclick={pdsls}>Open on pdsls.dev</button>

			{#if writable}
				{#if editing}
					<button onclick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
					<button class="ghost" onclick={() => (editing = false)} disabled={busy}>Cancel</button>
				{:else if confirming}
					<button class="danger" onclick={remove} disabled={busy}>
						{busy ? 'Deleting…' : 'Confirm delete'}
					</button>
					<button class="ghost" onclick={() => (confirming = false)} disabled={busy}>Keep</button>
				{:else}
					<button onclick={startEdit}>Edit</button>
					<button class="ghost" onclick={() => (confirming = true)}>Delete</button>
				{/if}
			{:else if readOnlyReason}
				<span class="ro">{readOnlyReason}</span>
			{/if}
		</footer>
	</div>
{/if}

<style>
	.scrim {
		position: fixed;
		inset: 0;
		background: color-mix(in srgb, var(--ink) 32%, transparent);
		border: 0;
		z-index: 20;
	}
	.modal {
		position: fixed;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		width: min(760px, calc(100vw - 48px));
		max-height: calc(100vh - 64px);
		display: flex;
		flex-direction: column;
		gap: 14px;
		background: var(--paper);
		border: 1px solid var(--ink);
		padding: 20px;
		z-index: 21;
	}
	header { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; }
	h2 {
		margin: 0;
		font-size: 14px;
		font-weight: 800;
		letter-spacing: -0.02em;
		font-family: 'IBM Plex Mono', monospace;
		overflow-wrap: anywhere;
	}
	.meta { margin: 0; display: flex; flex-wrap: wrap; gap: 6px 28px; font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; }
	.meta > div { display: flex; gap: 8px; }
	dt { color: var(--ink-soft); }
	dd { margin: 0; }
	.skew dd { font-weight: 500; }
	pre, textarea {
		margin: 0;
		flex: 1;
		min-height: 220px;
		overflow: auto;
		font-family: 'IBM Plex Mono', monospace;
		font-size: 11px;
		line-height: 1.5;
		background: var(--ground);
		border: 1px solid var(--rule);
		padding: 10px;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		color: var(--ink);
		resize: vertical;
	}
	.problem, .note, .ro { margin: 0; font-size: 11px; line-height: 1.5; color: var(--ink-soft); }
	.problem { color: var(--ink); border-left: 2px solid var(--ink); padding-left: 10px; }
	footer { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
	footer .ro { margin-left: auto; text-align: right; }
	button {
		font-family: 'Archivo', sans-serif;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		padding: 9px 12px;
		border: 1px solid var(--ink);
		background: var(--ink);
		color: var(--paper);
		cursor: pointer;
	}
	button.ghost { background: transparent; color: var(--ink); }
	button.danger { background: var(--paper); color: var(--ink); border-width: 2px; }
	button:disabled { opacity: 0.35; cursor: default; }
	.x { background: transparent; color: var(--ink-soft); border: 0; padding: 4px; }
</style>
