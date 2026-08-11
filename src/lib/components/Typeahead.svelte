<script>
	import { searchActors } from '$lib/atproto/typeahead.js';

	let {
		value = $bindable(''),
		onsubmit,
		/** fires on every keystroke, so a caller can drop state that the edit makes stale */
		oninput,
		placeholder = 'handle or DID',
		big = false,
		autofocus = false
	} = $props();

	let results = $state([]);
	let open = $state(false);
	let active = $state(-1);
	let busy = $state(false);
	let inputEl;
	let timer;
	let ac;

	function query(q) {
		clearTimeout(timer);
		if (ac) ac.abort();
		if (!q.trim() || q.trim().length < 2 || q.startsWith('did:')) {
			results = [];
			open = false;
			return;
		}
		// debounce: the service is a community box, not an endpoint to hammer
		timer = setTimeout(async () => {
			ac = new AbortController();
			busy = true;
			try {
				results = await searchActors(q, { limit: 8, signal: ac.signal });
				active = -1;
				open = results.length > 0;
			} catch (e) {
				if (e?.name !== 'AbortError') {
					results = [];
					open = false;
				}
			} finally {
				busy = false;
			}
		}, 180);
	}

	function choose(a) {
		value = a.handle;
		open = false;
		results = [];
		onsubmit?.(a.handle);
	}

	function key(e) {
		if (!open || !results.length) {
			if (e.key === 'Enter') onsubmit?.(value);
			return;
		}
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			active = (active + 1) % results.length;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			active = (active - 1 + results.length) % results.length;
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (active >= 0) choose(results[active]);
			else {
				open = false;
				onsubmit?.(value);
			}
		} else if (e.key === 'Escape') {
			open = false;
		}
	}

	$effect(() => {
		if (autofocus && inputEl) inputEl.focus();
	});
</script>

<div class="ta" class:big>
	<input
		bind:this={inputEl}
		type="text"
		bind:value
		{placeholder}
		spellcheck="false"
		autocapitalize="none"
		autocomplete="off"
		role="combobox"
		aria-expanded={open}
		aria-controls="ta-list"
		oninput={(e) => {
			query(e.currentTarget.value);
			oninput?.(e.currentTarget.value);
		}}
		onkeydown={key}
		onblur={() => setTimeout(() => (open = false), 120)}
		onfocus={() => results.length && (open = true)}
	/>
	{#if busy}<span class="spin" aria-hidden="true">·</span>{/if}
	{#if open}
		<ul id="ta-list" role="listbox">
			{#each results as a, i (a.did)}
				<li>
					<button
						type="button"
						class:on={i === active}
						role="option"
						aria-selected={i === active}
						onpointerdown={(e) => {
							// pointerdown rather than mousedown: it covers touch and pen
							// too, and preventing it suppresses the compatibility
							// mousedown, which is what keeps the input from blurring and
							// letting the 120ms blur timer close this list out from under
							// the tap before `choose` runs.
							e.preventDefault();
							choose(a);
						}}
						onmouseenter={() => (active = i)}
					>
						{#if a.avatar}
							<img src={a.avatar} alt="" loading="lazy" />
						{:else}
							<span class="noav" aria-hidden="true"></span>
						{/if}
						<span class="who">
							<b>{a.handle}</b>
							{#if a.displayName}<i>{a.displayName}</i>{/if}
						</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.ta {
		position: relative;
		width: 100%;
	}
	input {
		font-family: 'JetBrains Mono', monospace;
		font-size: 12px;
		padding: 8px 9px;
		border: 1px solid var(--rule);
		background: var(--ground);
		color: var(--ink);
		width: 100%;
		border-radius: 0;
	}
	.big input {
		font-size: 15px;
		padding: 13px 14px;
		text-align: center;
		background: var(--paper);
		border-color: var(--ink);
	}
	input:focus {
		outline: 2px solid var(--ink);
		outline-offset: 1px;
	}
	.spin {
		position: absolute;
		right: 9px;
		top: 50%;
		transform: translateY(-50%);
		font-family: 'JetBrains Mono', monospace;
		color: var(--ink-soft);
	}
	ul {
		position: absolute;
		z-index: 30;
		left: 0;
		right: 0;
		top: calc(100% + 3px);
		margin: 0;
		padding: 0;
		list-style: none;
		background: var(--paper);
		border: 1px solid var(--ink);
		max-height: 296px;
		overflow-y: auto;
	}
	li button {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 6px 8px;
		background: none;
		border: 0;
		cursor: pointer;
		text-align: left;
		font-family: inherit;
	}
	li button.on {
		background: var(--ink);
		color: var(--paper);
	}
	img,
	.noav {
		width: 22px;
		height: 22px;
		flex: none;
		object-fit: cover;
		background: var(--ground-deep);
	}
	.who {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.who b {
		font-family: 'JetBrains Mono', monospace;
		font-size: 11.5px;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.who i {
		font-size: 10px;
		font-style: normal;
		opacity: 0.65;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	@media (max-width: 820px) {
		/* A 34px row of eight results is a lottery with a fingertip. */
		li button {
			min-height: 48px;
			padding: 8px 10px;
		}
		img,
		.noav {
			width: 26px;
			height: 26px;
		}
		.who b { font-size: 13px; }
		.who i { font-size: 11px; }
		/* The on-screen keyboard takes roughly half the screen while this list
		   is open, and 296px of it would be behind the keyboard. */
		ul { max-height: 45vh; }
	}
</style>
