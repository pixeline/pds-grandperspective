<!-- src/lib/components/ProfileCard.svelte -->
<!--
  The loaded account's identity, shown above the behavioural panel so the type
  word ("Curator") reads as a trait, not a name. Circle avatar plus display
  name only -- the handle already sits in the repository form above.
-->
<script>
	/** @type {{ avatar?: string | null, name?: string | null }} */
	let { avatar = null, name = null } = $props();
</script>

{#if avatar || name}
	<section class="card" aria-label="Profile">
		{#if avatar}
			<img
				class="pfp"
				src={avatar}
				alt=""
				width="56"
				height="56"
				onerror={(e) => (e.currentTarget.style.display = 'none')}
			/>
		{/if}
		{#if name}
			<div class="name">{name}</div>
		{/if}
	</section>
{/if}

<style>
	.card {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 12px;
		padding: 12px 0;
		border-top: 1px solid var(--ink-soft);
	}
	/* A disc, the sanctioned exception to the no-rounded rule: a cropped face,
	   not decorative rounding. */
	.pfp {
		flex: none;
		width: 56px;
		height: 56px;
		object-fit: cover;
		display: block;
		border: 1px solid var(--ink-soft);
		border-radius: 50%;
	}
	.name {
		min-width: 0;
		overflow-wrap: anywhere;
		font-family: 'Inter', sans-serif;
		font-size: 21px;
		font-weight: 700;
		letter-spacing: -0.01em;
		line-height: 1.1;
		color: var(--ink);
	}
</style>
