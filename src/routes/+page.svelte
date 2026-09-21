<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import Hero from '$lib/components/Hero.svelte';
	import WalkCard from '$lib/components/WalkCard.svelte';
	import SuggestModal from '$lib/components/SuggestModal.svelte';
	import WalkerModal from '$lib/components/WalkerModal.svelte';
	import { walker, withWalker } from '$lib/walker.svelte';
	import { emptyActivity, type MyActivity } from '$lib/activity';
	import type { DatePoll, FeedWalk } from '$lib/types';
	import { voteDays } from '$lib/walks';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	let mine = $state<MyActivity>(emptyActivity());
	let suggesting = $state(false);
	let thanks = $state(false);

	async function openSuggest() {
		thanks = false;
		if (await walker.ensure()) suggesting = true;
	}

	onMount(() => walker.load());

	// Walk details are members-only: once someone is logged in, fetch the walks
	// and ideas (and what they've joined and voted for) - and again after each
	// thing they do.
	$effect(() => {
		const email = walker.current?.email;
		const token = walker.current?.token;
		void walker.version;
		if (!email) {
			mine = emptyActivity();
			return;
		}
		const controller = new AbortController();
		fetch('/api/me', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email, token }),
			signal: controller.signal
		})
			.then((r) => r.json())
			.then((m: MyActivity) => {
				// Removed by the organiser, or renamed: keep the browser in step.
				if (!m.known) return walker.logout();
				if (m.name && token && m.name !== walker.current?.name) walker.set({ email, name: m.name, token });
				mine = m;
			})
			.catch(() => {});
		return () => controller.abort();
	});

	const walks = $derived(mine.feed?.walks ?? []);
	const suggestions = $derived(mine.feed?.suggestions ?? []);
	const next = $derived(walks.find((w) => !w.cancelled) ?? walks[0]);
	const later = $derived(walks.filter((w) => w !== next));

	// Day-by-day vote counts for walks whose date is still being decided.
	function pollFor(w: FeedWalk): DatePoll | undefined {
		if (w.walk_date) return undefined;
		return {
			options: voteDays(w).map((date) => ({
				date,
				votes: w.tallies.find((t) => t.date === date)?.votes ?? 0
			})),
			voters: w.voters
		};
	}

	const errorFor = (walkId: string) =>
		form && 'walkId' in form && form.walkId === walkId && 'error' in form ? form.error : undefined;
	const savedFor = (walkId: string) =>
		!!form && 'walkId' in form && form.walkId === walkId && 'saved' in form;
</script>

<svelte:head>
	<title>Angels Walking Group</title>
	<meta name="description" content="A friendly walking group. Log in to see upcoming walks." />
</svelte:head>

<Hero />

{#if walker.current}
	<div class="wrap">
		<p class="me">
			<span class="avatar" aria-hidden="true">{walker.current.name.trim().charAt(0).toUpperCase()}</span>
			Walking as <strong>{walker.current.name}</strong>
			<span class="me-email">({walker.current.email})</span>
			<span class="me-sep">·</span>
			<button class="link" onclick={() => walker.logout()}>Not you? Log out</button>
		</p>
	</div>
{/if}

<WalkerModal />
<SuggestModal bind:open={suggesting} onsuggested={() => (thanks = true)} />

<main class="wrap">
	{#if !walker.loaded}
		<!-- Waiting to see if this browser is logged in. -->
	{:else if !walker.current}
		<section class="welcome" aria-labelledby="welcome-heading">
			<h2 id="welcome-heading">Log in to see our walks</h2>
			<p>
				To keep everyone safe, walk dates, meeting points and routes are only shown to walkers who have
				signed up.
			</p>
			<p>
				You’ll need the group passphrase - it’s in the WhatsApp group description. Ask the organiser if
				you can’t find it.
			</p>
			<button class="btn btn-primary" onclick={() => walker.ensure()}>Log in or sign up</button>
		</section>
	{:else if !mine.feed}
		<p class="loading" role="status">Loading walks…</p>
	{:else}
		<section aria-labelledby="next-heading">
			<h2 id="next-heading">Next walk</h2>
			{#if next}
				<WalkCard
					walk={next}
					featured
					joined={mine.joined.includes(next.id)}
					poll={pollFor(next)}
					myDates={mine.dates[next.id]}
					saved={savedFor(next.id)}
					error={errorFor(next.id)}
				/>
			{:else}
				<div class="empty">
					<p><strong>No walks planned just yet.</strong></p>
					<p>Check back soon — or suggest somewhere below to help plan the next one.</p>
				</div>
			{/if}
		</section>

		{#if later.length}
			<section aria-labelledby="later-heading">
				<h2 id="later-heading">Coming up</h2>
				<div class="stack">
					{#each later as walk (walk.id)}
						<WalkCard
							{walk}
							joined={mine.joined.includes(walk.id)}
							poll={pollFor(walk)}
							myDates={mine.dates[walk.id]}
							saved={savedFor(walk.id)}
							error={errorFor(walk.id)}
						/>
					{/each}
				</div>
			</section>
		{/if}

		<section aria-labelledby="ideas-heading">
			<h2 id="ideas-heading">Ideas for future walks</h2>
			<p class="section-lede">Tap the heart on ideas you’d enjoy, or suggest somewhere new.</p>

			<div class="suggest-row">
				<button class="btn btn-primary" onclick={openSuggest}>+ Suggest a walk</button>
				{#if thanks}<p class="thanks" role="status">Thanks for the idea!</p>{/if}
			</div>

			{#if suggestions.length}
				<ul class="ideas">
					{#each suggestions as s (s.id)}
						{@const voted = mine.voted.includes(s.id)}
						<li>
							<form method="POST" action="?/vote" use:enhance={withWalker()}>
								<input type="hidden" name="suggestion_id" value={s.id} />
								<button
									class="vote"
									class:voted
									aria-pressed={voted}
									aria-label="{voted ? 'Remove your vote for' : 'Vote for'} {s.title} ({s.votes} {s.votes === 1 ? 'vote' : 'votes'})"
								>
									<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7.5-4.6-9-9.3C2 7.5 4.2 4.5 7.4 4.5c2 0 3.6 1.2 4.6 2.8 1-1.6 2.6-2.8 4.6-2.8 3.2 0 5.4 3 4.4 6.2C19.5 15.4 12 20 12 20z" /></svg>
									<span class="count">{s.votes}</span>
								</button>
							</form>
							<div class="idea">
								<p class="idea-title">{s.title}</p>
								{#if s.details}<p class="idea-details">{s.details}</p>{/if}
								<div class="idea-meta">
									Suggested by {s.suggested_by ?? 'a walker'}
									{#if mine.suggested.includes(s.id)}
										<form method="POST" action="?/removeSuggestion" class="inline" use:enhance={withWalker()}>
											<input type="hidden" name="suggestion_id" value={s.id} />
											· <button class="link">Remove</button>
										</form>
									{/if}
								</div>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</main>

<footer class="wrap">
	<p>
		An independent, informal walking group. Not run by, affiliated with or endorsed by any charity or
		organisation.
	</p>
	<p><a href="/privacy">Privacy</a></p>
</footer>

<style>
	.wrap {
		max-width: 44rem;
		margin: 0 auto;
		padding: 0 1rem;
	}

	.me {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.2rem 0.4rem;
		margin: -0.75rem 0 2rem;
		padding: 0.55rem 0.9rem 0.55rem 0.55rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		font-size: 0.92rem;
		box-shadow: var(--shadow);
	}

	.avatar {
		display: grid;
		place-items: center;
		width: 1.75rem;
		height: 1.75rem;
		border-radius: 50%;
		background: var(--accent);
		color: var(--accent-contrast);
		font-size: 0.8rem;
		font-weight: 700;
		margin-right: 0.2rem;
	}

	.me-email {
		color: var(--muted);
		overflow-wrap: anywhere;
	}

	.me-sep {
		color: var(--muted);
	}

	main section {
		margin-bottom: 2.75rem;
	}

	h2 {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-size: 1.2rem;
		margin-bottom: 0.9rem;
	}

	/* A short dashed "trail" before each section heading. */
	h2::before {
		content: '';
		width: 1.4rem;
		border-top: 2.5px dashed var(--trail);
	}

	.section-lede {
		margin: -0.4rem 0 1.1rem;
		color: var(--muted);
	}

	.stack {
		display: grid;
		gap: 1.1rem;
	}

	.welcome {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1.6rem;
		box-shadow:
			inset 0 3px 0 var(--trail),
			var(--shadow);
	}

	.welcome h2 {
		font-size: 1.3rem;
	}

	.welcome p {
		margin: 0 0 1rem;
		color: var(--muted);
	}

	.welcome .btn {
		margin-top: 0.4rem;
	}

	.loading {
		color: var(--muted);
		text-align: center;
		padding: 2rem 0;
	}

	.empty {
		background: var(--surface);
		border: 1px dashed var(--border-strong);
		border-radius: var(--radius);
		padding: 1.6rem;
		text-align: center;
	}

	.empty p {
		margin: 0.25rem 0;
	}

	.suggest-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 1rem;
		margin-bottom: 1.1rem;
	}

	.thanks {
		margin: 0;
		color: var(--accent);
		font-weight: 600;
	}

	.ideas {
		list-style: none;
		padding: 0;
		margin: 0;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: var(--shadow);
		overflow: hidden;
	}

	.ideas li {
		display: flex;
		gap: 0.9rem;
		align-items: flex-start;
		padding: 1rem 1.1rem;
	}

	.ideas li + li {
		border-top: 1px solid var(--border);
	}

	.vote {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.1rem;
		min-width: 3.1rem;
		min-height: 3.1rem;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border-strong);
		background: var(--surface);
		color: var(--muted);
		cursor: pointer;
		line-height: 1;
		transition:
			border-color 0.15s,
			background 0.15s,
			color 0.15s;
	}

	.vote svg {
		width: 1.2rem;
		height: 1.2rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.9;
		stroke-linejoin: round;
	}

	.vote:hover {
		border-color: var(--trail);
		color: var(--trail);
	}

	.vote.voted {
		background: var(--trail-soft);
		border-color: var(--trail);
		color: var(--trail);
	}

	.vote.voted svg {
		fill: currentColor;
	}

	.count {
		font-size: 0.85rem;
		font-weight: 700;
	}

	.idea {
		min-width: 0;
	}

	.idea p {
		margin: 0;
	}

	.idea-title {
		font-weight: 700;
	}

	.idea-details {
		margin-top: 0.2rem !important;
		color: var(--muted);
		overflow-wrap: anywhere;
	}

	.idea-meta {
		margin-top: 0.35rem;
		font-size: 0.85rem;
		color: var(--muted);
	}

	.inline {
		display: inline;
	}

	.link {
		background: none;
		border: 0;
		padding: 0;
		color: var(--accent);
		text-decoration: underline;
		text-underline-offset: 0.18em;
		cursor: pointer;
		font-size: inherit;
	}

	footer {
		margin-top: 1rem;
		padding: 1.5rem 1rem 2.5rem;
		border-top: 1px solid var(--border);
		color: var(--muted);
		font-size: 0.85rem;
		text-align: center;
	}

	footer p {
		margin: 0.3rem 0;
	}
</style>
