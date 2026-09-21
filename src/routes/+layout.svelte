<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="theme-color" content="#e9f5ef" media="(prefers-color-scheme: light)" />
	<meta name="theme-color" content="#10241c" media="(prefers-color-scheme: dark)" />
</svelte:head>

{@render children()}
