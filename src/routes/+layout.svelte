<script>
	import { base } from '$app/paths';
	let { children } = $props();
</script>

<svelte:head>
	<!-- The icon is a real squarified layout of real stored bytes from a real
	     repository, coloured by the same golden-angle walk over sorted NSIDs
	     that the map itself uses -- so app.bsky.feed.post is the same purple
	     here as on screen. Generated with app.bsky.feed.like excluded, exactly
	     as the app now auto-hides it, because a 89% single-colour square says
	     nothing about what the tool does. Paths are base-relative so the build
	     stays droppable into any subfolder. -->
	<link rel="icon" type="image/svg+xml" href="{base}/favicon.svg" />
	<link rel="icon" type="image/png" sizes="32x32" href="{base}/icon-32.png" />
	<link rel="icon" type="image/png" sizes="16x16" href="{base}/icon-16.png" />
	<link rel="alternate icon" href="{base}/favicon.ico" />
	<link rel="apple-touch-icon" sizes="180x180" href="{base}/apple-touch-icon.png" />
	<link rel="manifest" href="{base}/manifest.webmanifest" />
	<meta name="theme-color" content="#171717" />
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
