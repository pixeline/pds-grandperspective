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
		/* `dvh` second, so a browser that doesn't know the unit keeps the `100%`
		   above. This app is a fixed, non-scrolling surface (see `overflow:
		   hidden` below), and on a phone `100%` resolves against the LARGE
		   viewport -- the one that assumes the URL bar is hidden. With the bar
		   showing, the bottom of the app (the map's info strip, the rail's
		   footer) sits under it and cannot be scrolled to, because nothing
		   scrolls. `dvh` tracks the viewport as the bar comes and goes. */
		height: 100dvh;
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
	/* iOS Safari zooms the layout viewport when a focused form control's text is
	   under 16px, and this app cannot recover from that: `overflow: hidden` on
	   body means the zoomed-out region is unreachable and unscrollable, so
	   tapping the handle field would strand the user in a half-visible app.
	   Every control here is deliberately smaller than 16px on desktop (the mono
	   scale is 10.5-12px), so the fix belongs at this one global seam rather
	   than restated in five components -- a control added later inherits it
	   instead of silently reintroducing the zoom.
	   `!important` is what makes it reach: Svelte scopes component styles by
	   appending a class, so `.txt` inside Rail is `.txt.svelte-hash` (two
	   classes) and out-specifies any global element selector. Same reason, and
	   same precedent, as the reduced-motion block above. */
	@media (max-width: 820px) {
		:global(input),
		:global(textarea),
		:global(select) {
			font-size: 16px !important;
		}
		/* kills the ~300ms wait-for-double-tap delay on every tap target */
		:global(button),
		:global(a),
		:global(input),
		:global(label) {
			touch-action: manipulation;
		}
	}
</style>
