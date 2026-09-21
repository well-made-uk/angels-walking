<script lang="ts">
	import { tick } from 'svelte';
	import { walker } from '$lib/walker.svelte';

	// Step 1 (everyone): email + the group passphrase. A known email logs in;
	// a new one goes on to sign up: name, then "Does this look right?".
	type Step = 'email' | 'welcome' | 'name' | 'confirm';

	let dialog: HTMLDialogElement | undefined = $state();
	let step = $state<Step>('email');
	let email = $state('');
	let name = $state('');
	let knownName = $state('');
	let token = $state('');
	// The group passphrase (shared in the walkers' WhatsApp group), plus a
	// honeypot field bots tend to fill in.
	let passphrase = $state('');
	let website = $state('');
	let error = $state('');
	let busy = $state(false);

	const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

	$effect(() => {
		if (walker.asking && dialog && !dialog.open) {
			// Start fresh each time, so a shared device never shows the last
			// person's email.
			email = '';
			name = '';
			knownName = '';
			token = '';
			passphrase = '';
			website = '';
			go('email');
			dialog.showModal();
		} else if (!walker.asking && dialog?.open) {
			dialog.close();
		}
	});

	async function go(next: Step) {
		step = next;
		error = '';
		await tick();
		dialog?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
	}

	async function call(body: Record<string, string>) {
		busy = true;
		try {
			const res = await fetch('/api/walker', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ ...body, passphrase, website })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error ?? 'Something went wrong - please try again.');
			return data as { name: string | null; token: string | null };
		} finally {
			busy = false;
		}
	}

	async function submitEmail(e: SubmitEvent) {
		e.preventDefault();
		email = email.trim().toLowerCase();
		if (!EMAIL.test(email)) {
			error = 'That email doesn’t look quite right.';
			return;
		}
		if (!passphrase.trim()) {
			error = 'Please enter the group passphrase.';
			return;
		}
		try {
			const { name: found, token: t } = await call({ action: 'login', email });
			if (found && t) {
				knownName = found;
				token = t;
				go('welcome');
			} else {
				go('name');
			}
		} catch (err) {
			error = (err as Error).message;
		}
	}

	function submitName(e: SubmitEvent) {
		e.preventDefault();
		name = name.trim();
		if (!name) error = 'Please tell us your name.';
		else go('confirm');
	}

	async function signUp() {
		try {
			const { name: saved, token: t } = await call({ action: 'signup', email, name });
			if (!t) throw new Error('Something went wrong - please try again.');
			walker.confirm({ email, name: saved ?? name, token: t });
		} catch (err) {
			const message = (err as Error).message;
			// A wrong passphrase is fixed on the first step.
			if (/passphrase/i.test(message)) {
				await go('email');
				passphrase = '';
			}
			error = message;
		}
	}
</script>

<dialog
	bind:this={dialog}
	aria-labelledby="walker-title"
	onclose={() => walker.asking && walker.dismiss()}
	onclick={(e) => e.target === dialog && walker.dismiss()}
>
	<div class="inner">
		{#if step === 'email'}
			<h2 id="walker-title">Log in or sign up</h2>
			<p class="lede">
				Enter your email and the group passphrase. If you’re new, we’ll ask your name next.
				<a href="/privacy" target="_blank" rel="noopener">Privacy</a>
			</p>
			<form onsubmit={submitEmail} novalidate>
				<div>
					<label for="walker-email">Email address</label>
					<input
						id="walker-email"
						type="email"
						bind:value={email}
						autocomplete="email"
						inputmode="email"
						maxlength="254"
						required
						data-autofocus
					/>
				</div>
				<div>
					<label for="walker-passphrase">Group passphrase</label>
					<input
						id="walker-passphrase"
						type="text"
						bind:value={passphrase}
						autocomplete="off"
						autocapitalize="off"
						maxlength="100"
						required
					/>
					<p class="small hint">It’s in the WhatsApp group description.</p>
				</div>
				<!-- Honeypot: hidden from people, tempting to bots. -->
				<div class="hp" aria-hidden="true">
					<label for="walker-website">Website</label>
					<input id="walker-website" type="text" name="website" bind:value={website} tabindex="-1" autocomplete="off" />
				</div>
				{#if error}<p class="error" role="alert">{error}</p>{/if}
				<div class="buttons">
					<button type="button" class="btn btn-ghost" onclick={() => walker.dismiss()}>Cancel</button>
					<button class="btn btn-primary" disabled={busy}>{busy ? 'Checking…' : 'Continue'}</button>
				</div>
			</form>
		{:else if step === 'welcome'}
			<h2 id="walker-title">Welcome back!</h2>
			<p class="lede">Is this you?</p>
			<dl>
				<dt>Name</dt>
				<dd>{knownName}</dd>
				<dt>Email</dt>
				<dd class="email">{email}</dd>
			</dl>
			<div class="buttons">
				<button type="button" class="btn btn-ghost" onclick={() => go('email')}>No, go back</button>
				<button
					type="button"
					class="btn btn-primary"
					data-autofocus
					onclick={() => walker.confirm({ email, name: knownName, token })}
				>
					Yes, that’s me
				</button>
			</div>
		{:else if step === 'name'}
			<h2 id="walker-title">Nice to meet you</h2>
			<p class="lede">
				We don’t have <strong class="email">{email}</strong> yet. What’s your name?
			</p>
			<form onsubmit={submitName} novalidate>
				<div>
					<label for="walker-name">Your name</label>
					<input
						id="walker-name"
						type="text"
						bind:value={name}
						autocomplete="name"
						maxlength="60"
						required
						data-autofocus
					/>
				</div>
				<p class="small">
					Your name is shown to other walkers. Your email is only seen by the organiser, in case plans
					change. <a href="/privacy" target="_blank" rel="noopener">How we use your details</a>
				</p>
				{#if error}<p class="error" role="alert">{error}</p>{/if}
				<div class="buttons">
					<button type="button" class="btn btn-ghost" onclick={() => go('email')}>Back</button>
					<button class="btn btn-primary">Continue</button>
				</div>
			</form>
		{:else}
			<h2 id="walker-title">Does this look right?</h2>
			<dl>
				<dt>Name</dt>
				<dd>{name}</dd>
				<dt>Email</dt>
				<dd class="email">{email}</dd>
			</dl>
			{#if error}<p class="error" role="alert">{error}</p>{/if}
			<div class="buttons">
				<button type="button" class="btn btn-ghost" onclick={() => go('name')}>No, change it</button>
				<button type="button" class="btn btn-primary" data-autofocus disabled={busy} onclick={signUp}>
					{busy ? 'Signing up…' : 'Yes, sign me up'}
				</button>
			</div>
		{/if}
	</div>
</dialog>

<style>
	dialog {
		width: min(28rem, calc(100vw - 2rem));
		border-radius: var(--radius);
		padding: 0;
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
		box-shadow: 0 24px 64px rgb(12 28 22 / 0.28);
	}


	.inner {
		padding: 1.5rem;
	}

	h2 {
		font-size: 1.4rem;
		margin-bottom: 0.5rem;
	}

	.lede {
		margin: 0 0 1.25rem;
		color: var(--muted);
	}

	form {
		display: grid;
		gap: 1rem;
	}

	.small {
		margin: 0;
		font-size: 0.9rem;
		color: var(--muted);
	}

	.error {
		margin: 0 0 1rem;
	}

	.hint {
		margin-top: 0.35rem;
	}

	form .error {
		margin: 0;
	}

	dl {
		margin: 1rem 0 1.5rem;
		padding: 1rem;
		background: var(--surface-2);
		border-radius: 10px;
	}

	dt {
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted);
		font-weight: 600;
	}

	dd {
		margin: 0 0 0.75rem;
		font-size: 1.2rem;
		font-weight: 700;
	}

	dd:last-child {
		margin-bottom: 0;
	}

	.email {
		overflow-wrap: anywhere;
	}

	.hp {
		position: absolute;
		left: -10000px;
		width: 1px;
		height: 1px;
		overflow: hidden;
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
