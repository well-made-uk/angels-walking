<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import WalkForm from '$lib/components/WalkForm.svelte';
	import { dayLabel, dayRangeLabel, votingClosesLabel, walkDate, walkTime } from '$lib/format';
	import { voteDays } from '$lib/walks';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const walk = $derived(data.walk);
	const top = $derived(Math.max(0, ...data.tally.map((t) => t.votes)));
	const leader = $derived(top > 0 ? data.tally.find((t) => t.votes === top) : undefined);
	const created = $derived(page.url.searchParams.has('created'));

	let copied = $state(false);
	async function copyEmails() {
		await navigator.clipboard.writeText(data.attendees.map((a) => a.email).join(', '));
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

<svelte:head>
	<title>{walk.title} · Organiser</title>
</svelte:head>

<p class="crumb"><a href="/organiser">← Walks</a></p>
<h1>{walk.title}</h1>

{#if created}
	<p class="notice" role="status">Walk created — it’s now on the public page.</p>
{:else if form && 'saved' in form}
	<p class="notice" role="status">Changes saved.</p>
{:else if form && 'locked' in form}
	<p class="notice" role="status">Date locked in. People can now sign up.</p>
{/if}
{#if form && 'actionError' in form}
	<p class="error" role="alert">{form.actionError}</p>
{/if}

<section class="panel">
	{#if walk.starts_at}
		<h2>{walkDate(walk.starts_at)}, {walkTime(walk.starts_at)}</h2>
		<div class="going-head">
			<p class="muted">
				{data.attendees.length}{walk.max_people ? ` of ${walk.max_people}` : ''} signed up
			</p>
			{#if data.attendees.length}
				<button class="btn btn-ghost small" onclick={copyEmails}>{copied ? 'Copied ✓' : 'Copy emails'}</button>
			{/if}
		</div>
		{#if data.attendees.length}
			<ul class="people">
				{#each data.attendees as s (s.id)}
					<li>
						<span>{s.name} <a class="email" href="mailto:{s.email}">{s.email}</a></span>
						<form
							method="POST"
							action="?/removeSignup"
							use:enhance={({ cancel }) => {
								if (!confirm(`Remove ${s.name} from this walk?`)) cancel();
							}}
						>
							<input type="hidden" name="signup_id" value={s.id} />
							<button class="link">Remove</button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}
	{:else}
		<h2>Voting on a day, {dayRangeLabel(voteDays(walk))}</h2>
		<p class="muted">
			{data.voters} {data.voters === 1 ? 'person has' : 'people have'} voted.
			{#if walk.votes_open_at && new Date(walk.votes_open_at).getTime() > Date.now()}Opens {walkDate(walk.votes_open_at)}.{/if}
			{#if walk.votes_close_at}Closes at the end of {votingClosesLabel(walk.votes_close_at)}.{/if}
		</p>
		<ul class="tally">
			{#each data.tally as t (t.date)}
				<li class:leading={top > 0 && t.votes === top}>
					<span>{dayLabel(t.date)}</span>
					<span class="bar"><span style="width: {top ? (t.votes / top) * 100 : 0}%"></span></span>
					<span class="n">{t.votes}</span>
				</li>
			{/each}
		</ul>
		<form
			method="POST"
			action="?/lock"
			use:enhance={({ cancel }) => {
				const day = leader ? dayLabel(leader.date, 'long') : 'the first Saturday (no votes yet)';
				if (!confirm(`Close voting now and lock in ${day}?`)) cancel();
			}}
		>
			<button class="btn btn-ghost">Close voting and lock in {leader ? dayLabel(leader.date) : 'a date'} now</button>
		</form>
	{/if}
</section>

<h2 class="edit-heading">Edit details</h2>
<WalkForm
	values={form && 'values' in form && form.values ? form.values : data.values}
	errors={form && 'errors' in form ? form.errors : undefined}
	imageUrl={data.imageUrl}
	editing
	submitLabel="Save changes"
/>

<section class="danger">
	<form
		method="POST"
		action="?/delete"
		use:enhance={({ cancel }) => {
			if (!confirm(`Delete “${walk.title}” and everyone’s sign-ups and votes? This can’t be undone. (To keep it visible as cancelled, tick “This walk is cancelled” instead.)`)) cancel();
		}}
	>
		<button class="btn btn-ghost danger-btn">Delete this walk</button>
	</form>
</section>

<style>
	.crumb {
		margin: 0 0 0.5rem;
	}

	h1 {
		margin-bottom: 1rem;
	}

	.notice {
		background: var(--accent-soft);
		color: var(--accent);
		font-weight: 600;
		border-radius: 10px;
		padding: 0.6rem 1rem;
	}

	.panel {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1.25rem;
		margin-bottom: 2rem;
	}

	.panel h2 {
		font-size: 1.15rem;
		margin-bottom: 0.25rem;
	}

	.muted {
		color: var(--muted);
		margin: 0 0 0.75rem;
	}

	.people,
	.tally {
		list-style: none;
		padding: 0;
		margin: 0 0 1rem;
		display: grid;
		gap: 0.3rem;
	}

	.going-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
	}

	.small {
		min-height: 36px;
		padding: 0.3rem 0.8rem;
		font-size: 0.9rem;
	}

	.email {
		color: var(--muted);
		font-size: 0.9rem;
		margin-left: 0.4rem;
		overflow-wrap: anywhere;
	}

	.people li {
		display: flex;
		justify-content: space-between;
		padding: 0.35rem 0;
		border-bottom: 1px solid var(--border);
	}

	.tally li {
		display: grid;
		grid-template-columns: 6.5rem 1fr 2ch;
		gap: 0.75rem;
		align-items: center;
	}

	.tally .bar {
		height: 0.5rem;
		background: var(--surface-2);
		border-radius: 999px;
		overflow: hidden;
	}

	.tally .bar span {
		display: block;
		height: 100%;
		background: var(--muted);
		opacity: 0.45;
	}

	.tally .leading {
		font-weight: 700;
	}

	.tally .leading .bar span {
		background: var(--accent);
		opacity: 1;
	}

	.n {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.link {
		background: none;
		border: 0;
		padding: 0;
		color: var(--warn);
		text-decoration: underline;
		cursor: pointer;
	}

	.edit-heading {
		font-size: 1.25rem;
		margin-bottom: 0.75rem;
	}

	.danger {
		margin-top: 2.5rem;
		padding-top: 1.5rem;
		border-top: 1px solid var(--border);
	}

	.danger-btn {
		color: var(--warn);
		border-color: var(--warn);
	}
</style>
