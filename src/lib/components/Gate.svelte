<script>
	import Typeahead from './Typeahead.svelte';
	let { handle = $bindable(''), onpick } = $props();

	// schematic previews, drawn from the same palette as the viewers themselves
	const HUES = [8, 145, 283, 60, 200, 330];
</script>

<div class="gate">
	<h1>GrandPerspective<small>PDS EDITION</small></h1>

	<label class="ask" for="gate-handle">Which ATProto user would you like to visit?</label>
	<div class="field">
		<Typeahead bind:value={handle} big autofocus onsubmit={(h) => onpick(h)} />
	</div>

	<div class="cards">
		<button class="card" onclick={() => onpick()}>
			<span class="thumb">
				<svg viewBox="0 0 220 120" aria-hidden="true">
					{#each [[4, 4, 96, 68, 0], [104, 4, 62, 40, 1], [170, 4, 46, 40, 2], [104, 48, 112, 24, 3], [4, 76, 60, 40, 4], [68, 76, 48, 40, 5], [120, 76, 44, 22, 2], [168, 76, 48, 22, 1], [120, 102, 96, 14, 3]] as [x, y, w, h, hi]}
						<g>
							<rect {x} {y} width={w} height={h} fill="hsl({HUES[hi]} 55% 92%)" />
							{#each Array(Math.max(1, Math.floor(w / 11)) * Math.max(1, Math.floor(h / 11))) as _, j}
								{@const cols = Math.max(1, Math.floor(w / 11))}
								<rect
									x={x + 2 + (j % cols) * 11}
									y={y + 2 + Math.floor(j / cols) * 11}
									width="9"
									height="9"
									fill="hsl({HUES[hi]} 62% {48 + ((j * 7) % 22)}%)"
								/>
							{/each}
						</g>
					{/each}
				</svg>
			</span>
			<b>Read repository</b>
			<span class="desc">See where an atproto repo's bytes actually go, one cell per record.</span>
			<i>survey</i>
		</button>
	</div>

	<p class="note">
		Reads every collection in any repo — including lexicons it has never heard of. Public data
		only, straight from the PDS.
	</p>
</div>

<style>
	.gate {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 18px;
		padding: 28px;
		overflow-y: auto;
	}
	h1 {
		font-size: 17px;
		font-weight: 800;
		letter-spacing: -0.03em;
		text-transform: uppercase;
		margin: 0;
		text-align: center;
		line-height: 1.05;
	}
	h1 small {
		display: block;
		font-size: 9.5px;
		font-weight: 600;
		letter-spacing: 0.16em;
		color: var(--ink-soft);
		margin-top: 6px;
	}
	.ask {
		font-size: 13px;
		color: var(--ink);
		text-align: center;
	}
	.field {
		width: min(420px, 100%);
		margin-top: -8px;
	}
	.cards {
		display: flex;
		gap: 14px;
		flex-wrap: wrap;
		justify-content: center;
	}
	.card {
		width: 268px;
		background: var(--paper);
		color: var(--ink);
		border: 1px solid var(--ink);
		padding: 0 0 14px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		cursor: pointer;
		text-align: left;
		font-family: 'Archivo', sans-serif;
	}
	.card:hover,
	.card:focus-visible {
		background: var(--ink);
		color: var(--paper);
		outline: none;
	}
	.thumb {
		display: block;
		background: var(--ground);
		border-bottom: 1px solid var(--rule);
		margin-bottom: 8px;
	}
	.thumb svg {
		display: block;
		width: 100%;
		height: auto;
	}
	.card b {
		font-size: 15px;
		font-weight: 800;
		letter-spacing: -0.02em;
		padding: 0 15px;
	}
	.desc {
		font-size: 11.5px;
		line-height: 1.45;
		padding: 0 15px;
	}
	.card i {
		font-family: 'IBM Plex Mono', monospace;
		font-style: normal;
		font-size: 9px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		opacity: 0.6;
		padding: 0 15px;
	}
	.note {
		font-size: 10.5px;
		color: var(--ink-soft);
		max-width: 560px;
		text-align: center;
		line-height: 1.5;
		margin: 0;
	}
</style>
