<script>
	let { children } = $props();
</script>

<!-- Icons, the manifest and the font links live in `src/app.html`, not here.
     This app ships with ssr=false, so build/index.html is a shell and nothing
     from a component's <svelte:head> reaches the static HTML -- a browser
     fetches the favicon and reads the manifest before hydration, and
     render-blocking font links belong in the first response too. -->

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
