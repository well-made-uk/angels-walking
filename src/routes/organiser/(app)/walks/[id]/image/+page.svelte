<script lang="ts">
	import WalkImage from '$lib/components/WalkImage.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Share image · {data.title} · Organiser</title>
</svelte:head>

<p class="crumb"><a href="/organiser/walks/{data.walkId}">← {data.title}</a></p>
<h1>Share image</h1>
<p class="muted">
	Pick a picture to post in the group chat. “Again” draws a new version of one style, and “Save PNG” downloads it.
</p>

{#key data.walkId}
	<WalkImage title={data.title} />
{/key}

<style>
	.crumb {
		margin: 0 0 0.5rem;
	}
</style>
