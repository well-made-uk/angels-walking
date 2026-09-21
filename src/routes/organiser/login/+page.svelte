<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	let busy = $state(false);
	const step = $derived(form?.step ?? 'email');

	const submit = () => {
		busy = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			busy = false;
		};
	};
</script>

<svelte:head>
	<title>Organiser sign in · Angels Walking Group</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main>
	<p class="eyebrow">Angels Walking Group</p>
	<h1>Organiser sign in</h1>

	{#if step === 'code'}
		<form method="POST" action="?/verify" class="panel" use:enhance={submit}>
			<p>
				If <strong>{form?.email}</strong> belongs to an organiser, we’ve emailed a sign-in code. It can take
				a minute to arrive; check your spam folder too.
			</p>
			<input type="hidden" name="email" value={form?.email} />
			<div>
				<label for="code">Code</label>
				<input
					id="code"
					name="code"
					type="text"
					inputmode="numeric"
					autocomplete="one-time-code"
					pattern="[0-9 ]*"
					maxlength="12"
					required
				/>
			</div>
			<button class="btn btn-primary" disabled={busy}>{busy ? 'Checking…' : 'Sign in'}</button>
			{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
			<p class="small"><a href="/organiser/login">Start again / use a different email</a></p>
		</form>
	{:else}
		<form method="POST" action="?/sendCode" class="panel" use:enhance={submit}>
			<p>We’ll email you a code to sign in with. Only existing organisers can sign in here.</p>
			<div>
				<label for="email">Email</label>
				<input id="email" name="email" type="email" autocomplete="email" required value={form?.email ?? ''} />
			</div>
			<button class="btn btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Email me a code'}</button>
			{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
		</form>
	{/if}

	<p class="back"><a href="/">← Back to the walks</a></p>
</main>

<style>
	main {
		max-width: 26rem;
		margin: 0 auto;
		padding: 3rem 1rem;
	}


	h1 {
		margin: 0.4rem 0 1.5rem;
	}

	.panel {
		display: grid;
		gap: 1rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1.25rem;
	}

	.panel p {
		margin: 0;
	}

	#code {
		font-size: 1.5rem;
		letter-spacing: 0.3em;
		text-align: center;
		font-variant-numeric: tabular-nums;
	}

	.small {
		font-size: 0.95rem;
	}

	.error {
		margin: 0;
	}

	.back {
		margin-top: 1.5rem;
	}
</style>
