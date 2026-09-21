<script lang="ts">
	import WalkForm from '$lib/components/WalkForm.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>Plan a walk · Organiser</title>
</svelte:head>

<p class="crumb"><a href="/organiser">← Walks</a></p>
<h1>Plan a walk</h1>
{#if data.suggestion}
	<p class="from">
		From the suggestion <strong>“{data.suggestion.title}”</strong>
		{#if data.suggestion.suggested_by}by {data.suggestion.suggested_by}{/if}
		(♥ {data.suggestion.votes}). They’ll be credited on the walk, and the idea will leave the suggestions list.
	</p>
{/if}

<WalkForm values={form?.values ?? data.values} errors={form?.errors} submitLabel="Create walk" />

<style>
	.crumb {
		margin: 0 0 0.5rem;
	}

	h1 {
		margin-bottom: 1rem;
	}

	.from {
		background: var(--accent-soft);
		border-radius: 10px;
		padding: 0.75rem 1rem;
		margin: 0 0 1.5rem;
	}
</style>
