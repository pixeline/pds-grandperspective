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
		/* atmospheric: near-white ground so the portrait reads as suspended in air */
		--ground: #f6f8f7;
		--ground-deep: #ecefed;
		--ink: #161a18;
		--ink-soft: #6e7672;
		--rule: #e2e7e4;
		--paper: #ffffff;
	}
	:global(*) {
		box-sizing: border-box;
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
</style>
