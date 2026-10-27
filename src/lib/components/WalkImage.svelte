<script lang="ts">
	import { onMount } from 'svelte';
	import {
		IMAGE_STYLES,
		fontsReady,
		imageFileName,
		randomSeed,
		seedFrom,
		svgToPng,
		walkImageSvg
	} from '$lib/walk-image';

	let { title: initialTitle }: { title: string } = $props();

	// The name on the image. Starts as the walk's name; change it for a different wording.
	// svelte-ignore state_referenced_locally
	let title = $state(initialTitle);
	// The same walk starts with the same five pictures; "Again" and "Shuffle all" draw new ones.
	// svelte-ignore state_referenced_locally
	let seeds = $state(IMAGE_STYLES.map((_, i) => seedFrom(initialTitle, i)));
	let ready = $state(false);
	let note = $state('');

	onMount(async () => {
		await fontsReady();
		ready = true;
	});

	const images = $derived(ready ? IMAGE_STYLES.map((_, i) => walkImageSvg(i, seeds[i], title)) : []);

	function again(i: number) {
		seeds[i] = randomSeed();
	}

	function shuffleAll() {
		seeds = IMAGE_STYLES.map(() => randomSeed());
	}

	function say(text: string) {
		note = text;
		setTimeout(() => (note = ''), 2500);
	}

	async function save(i: number) {
		try {
			const url = URL.createObjectURL(await svgToPng(images[i]));
			const a = document.createElement('a');
			a.href = url;
			a.download = imageFileName(title, i);
			a.click();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
		} catch {
			say('Could not make that image. Please try again.');
		}
	}

	async function copy(i: number) {
		try {
			await navigator.clipboard.write([new ClipboardItem({ 'image/png': svgToPng(images[i]) })]);
			say('Image copied. Paste it into the chat.');
		} catch {
			say('This browser can’t copy images. Use Save PNG instead.');
		}
	}
</script>

<div class="controls">
	<label>
		Name on the image
		<input type="text" bind:value={title} maxlength="120" />
	</label>
	<button type="button" class="btn btn-ghost" onclick={shuffleAll}>Shuffle all</button>
</div>
<p class="status" role="status">{note}</p>

{#if ready}
	<div class="grid">
		{#each IMAGE_STYLES as style, i (style.name)}
			<figure>
				<div class="frame">{@html images[i]}</div>
				<figcaption>
					<div>
						<strong>{style.name}</strong>
						<span>{style.blurb}</span>
					</div>
					<div class="actions">
						<button type="button" class="btn btn-ghost small" onclick={() => again(i)}>Again</button>
						<button type="button" class="btn btn-ghost small" onclick={() => copy(i)}>Copy</button>
						<button type="button" class="btn btn-primary small" onclick={() => save(i)}>Save PNG</button>
					</div>
				</figcaption>
			</figure>
		{/each}
	</div>
{:else}
	<p class="muted">Drawing the pictures…</p>
{/if}

<style>
	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem 1rem;
		align-items: end;
		margin: 1rem 0 0.5rem;
	}

	.controls label {
		display: grid;
		gap: 0.3rem;
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--muted);
		flex: 1 1 280px;
	}

	.controls input {
		font: inherit;
		font-weight: 400;
		color: var(--text);
		padding: 0.55rem 0.75rem;
		border-radius: var(--radius-sm);
		border: 1.5px solid var(--border-strong);
		background: var(--surface);
	}

	.status {
		min-height: 1.5rem;
		margin: 0 0 0.5rem;
		color: var(--accent);
		font-weight: 600;
	}

	.grid {
		display: grid;
		gap: 1.75rem;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
	}

	figure {
		margin: 0;
		display: grid;
		gap: 0.6rem;
		align-content: start;
	}

	.frame {
		border-radius: var(--radius);
		overflow: hidden;
		box-shadow: var(--shadow);
		line-height: 0;
		background: var(--surface);
	}

	.frame :global(svg) {
		width: 100%;
		height: auto;
		display: block;
	}

	figcaption {
		display: grid;
		gap: 0.5rem;
	}

	figcaption strong {
		display: block;
	}

	figcaption span {
		color: var(--muted);
		font-size: 0.9rem;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
</style>
