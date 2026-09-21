<script lang="ts">
	import { enhance } from '$app/forms';
	import { withWalker } from '$lib/walker.svelte';

	interface Props {
		open: boolean;
		onsuggested?: () => void;
	}

	let { open = $bindable(), onsuggested }: Props = $props();

	let dialog: HTMLDialogElement | undefined = $state();
	let busy = $state(false);
	let error = $state('');

	$effect(() => {
		if (open && dialog && !dialog.open) {
			error = '';
			dialog.showModal();
		} else if (!open && dialog?.open) {
			dialog.close();
		}
	});
</script>

<dialog
	bind:this={dialog}
	aria-labelledby="suggest-title"
	onclose={() => (open = false)}
	onclick={(e) => e.target === dialog && (open = false)}
>
	<form
		method="POST"
		action="?/suggest"
		class="inner"
		use:enhance={withWalker({
			busy: (b) => (busy = b),
			reset: true,
			done: (result) => {
				if (result.type === 'success') {
					open = false;
					onsuggested?.();
				} else if (result.type === 'failure') {
					error = String(result.data?.error ?? 'Something went wrong - please try again.');
				}
			}
		})}
	>
		<h2 id="suggest-title">Suggest a walk</h2>
		<p class="lede">Know a good route? Other walkers can heart it, and the organiser may pick it for a future walk.</p>

		<div>
			<label for="s-title">Where would you like to walk?</label>
			<input
				id="s-title"
				type="text"
				name="title"
				maxlength="120"
				required
				placeholder="e.g. Bluebell woods near the old mill"
			/>
		</div>
		<div>
			<label for="s-details">Anything else? <span class="optional">(optional)</span></label>
			<textarea
				id="s-details"
				name="details"
				rows="4"
				maxlength="1000"
				placeholder="Distance, parking, a café at the end, best time of year…"
			></textarea>
		</div>

		{#if error}<p class="error" role="alert">{error}</p>{/if}

		<div class="buttons">
			<button type="button" class="btn btn-ghost" onclick={() => (open = false)}>Cancel</button>
			<button class="btn btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Suggest this walk'}</button>
		</div>
	</form>
</dialog>

<style>
	dialog {
		width: min(30rem, calc(100vw - 2rem));
		border-radius: var(--radius);
		padding: 0;
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
		box-shadow: 0 24px 64px rgb(12 28 22 / 0.28);
	}


	.inner {
		padding: 1.5rem;
		display: grid;
		gap: 1rem;
	}

	h2 {
		font-size: 1.4rem;
	}

	.lede {
		margin: -0.5rem 0 0;
		color: var(--muted);
	}

	.optional {
		font-weight: 400;
		color: var(--muted);
	}

	textarea {
		resize: vertical;
	}

	.error {
		margin: 0;
	}

	.buttons {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.5rem;
	}

	.buttons .btn {
		flex: 1 1 auto;
	}
</style>
