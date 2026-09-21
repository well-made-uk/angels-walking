<script lang="ts">
	import type { LayoutData } from './$types';
	import type { Snippet } from 'svelte';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
</script>

<svelte:head>
	<meta name="robots" content="noindex" />
</svelte:head>

<header class="bar">
	<div class="inner">
		<a class="home" href="/organiser">Walks · Organiser</a>
		<nav>
			<a href="/" target="_blank" rel="noopener">View site ↗</a>
			<form method="POST" action="/organiser/logout">
				<button class="link" title="Signed in as {data.email}">Sign out</button>
			</form>
		</nav>
	</div>
</header>

<main class="inner">
	{@render children()}
</main>

<style>
	.bar {
		background: var(--accent);
		color: var(--accent-contrast);
		margin-bottom: 1.5rem;
	}

	.inner {
		max-width: 48rem;
		margin: 0 auto;
		padding: 0 1rem;
	}

	.bar .inner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		min-height: 3.5rem;
	}

	.home {
		color: inherit;
		font-weight: 700;
		text-decoration: none;
	}

	nav {
		display: flex;
		gap: 1rem;
		align-items: center;
	}

	nav a,
	.link {
		color: inherit;
		font-size: 0.95rem;
	}

	.link {
		background: none;
		border: 0;
		padding: 0;
		text-decoration: underline;
		cursor: pointer;
	}

	main {
		padding-bottom: 3rem;
	}
</style>
