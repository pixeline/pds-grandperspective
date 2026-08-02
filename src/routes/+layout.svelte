<script>
	import favicon from '$lib/assets/favicon.svg';
	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;800&family=IBM+Plex+Mono:wght@400;500&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

{@render children()}

<style>
	:global(:root) {
		/* true neutrals: the only hue on screen comes from the repo. The old
		   greens were deliberate when the brief wanted the portrait "suspended
		   in air"; that framing is retired with the stack. */
		--ground: #f7f7f7;
		--ground-deep: #ededed;
		--ink: #171717;
		--ink-soft: #737373;
		--rule: #e4e4e4;
		--paper: #ffffff;
	}
	:global(*) {
		box-sizing: border-box;
		/* International Style applied to data: no ornament that carries no
		   information. Enforced by a test, because standing constraints decay. */
		border-radius: 0;
		box-shadow: none;
	}
	:global(html),
	:global(body) {
		margin: 0;
		height: 100%;
	}
	:global(body) {
		background: var(--ground);
		color: var(--ink);
		font-family: 'Archivo', system-ui, sans-serif;
		overflow: hidden;
	}
	@media (prefers-reduced-motion: reduce) {
		:global(*) {
			animation-duration: 0.01ms !important;
			transition-duration: 0.01ms !important;
		}
	}
</style>
