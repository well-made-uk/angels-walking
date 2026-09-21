<script lang="ts">
	import { enhance } from '$app/forms';
	import { dayRangeLabel, votingClosesLabel, walkDate, walkTime } from '$lib/format';
	import { voteDays } from '$lib/walks';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const count = (w: { signups: { id: string }[] }) => w.signups.length;
</script>

<svelte:head>
	<title>Organiser · Angels Walking Group</title>
</svelte:head>

<div class="head">
	<h1>Walks</h1>
	<a class="btn btn-primary" href="/organiser/walks/new">+ Plan a walk</a>
</div>

{#if data.loadError}
	<p class="error" role="alert">Some walks or suggestions couldn’t be loaded. Please refresh the page; if it keeps happening, something needs fixing.</p>
{/if}

{#if data.walks.length}
	<ul class="list">
		{#each data.walks as w (w.id)}
			<li>
				<a href="/organiser/walks/{w.id}">
					<span class="title">{w.title}</span>
					<span class="meta">
						{#if w.cancelled}
							<span class="chip chip-warn">Cancelled</span>
						{/if}
						{#if w.starts_at}
							{walkDate(w.starts_at)}, {walkTime(w.starts_at)} ·
							{count(w)}{w.max_people ? ` of ${w.max_people}` : ''} going
						{:else}
							<span class="chip">Voting</span>
							{dayRangeLabel(voteDays(w))}
							{#if w.votes_close_at}· closes end of {votingClosesLabel(w.votes_close_at)}{/if}
						{/if}
					</span>
				</a>
			</li>
		{/each}
	</ul>
{:else if !data.loadError}
	<p class="empty">No upcoming walks. Plan one from scratch, or from a suggestion below.</p>
{/if}

<h2>Suggestions</h2>
{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
{#if data.suggestions.length}
	<ul class="list ideas">
		{#each data.suggestions as s (s.id)}
			<li class:done={s.promoted}>
				<div>
					<p class="title">{s.title}</p>
					{#if s.details}<p class="details">{s.details}</p>{/if}
					<p class="meta">
						♥ {s.votes} · {s.suggested_by ?? 'Anonymous'}
						{#if s.promoted}· <span class="chip">Planned</span>{/if}
					</p>
				</div>
				<div class="actions">
					{#if !s.promoted}
						<a class="btn btn-primary small" href="/organiser/walks/new?suggestion={s.id}">Plan this walk</a>
					{/if}
					<form
						method="POST"
						action="?/removeSuggestion"
						use:enhance={({ cancel }) => {
							if (!confirm(`Remove the suggestion “${s.title}”?`)) cancel();
						}}
					>
						<input type="hidden" name="suggestion_id" value={s.id} />
						<button class="btn btn-ghost small">Remove</button>
					</form>
				</div>
			</li>
		{/each}
	</ul>
{:else}
	<p class="empty">No suggestions yet.</p>
{/if}

{#if data.past.length}
	<h2>Recent walks</h2>
	<ul class="list">
		{#each data.past as w (w.id)}
			<li>
				<a href="/organiser/walks/{w.id}">
					<span class="title">{w.title}</span>
					<span class="meta">{w.starts_at ? walkDate(w.starts_at) : ''} · {count(w)} went</span>
				</a>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	h2 {
		margin: 2.5rem 0 0.75rem;
		font-size: 1.25rem;
	}

	.list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 0.5rem;
	}

	.list li {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 12px;
	}

	.list a:not(.btn) {
		display: grid;
		gap: 0.15rem;
		padding: 0.85rem 1rem;
		color: inherit;
		text-decoration: none;
	}

	.list a:not(.btn):hover .title {
		text-decoration: underline;
	}

	.title {
		font-weight: 700;
		margin: 0;
	}

	.meta,
	.details {
		color: var(--muted);
		font-size: 0.95rem;
		margin: 0;
	}

	.details {
		color: var(--text);
		margin-top: 0.15rem;
	}

	.chip {
		display: inline-block;
		background: var(--accent-soft);
		color: var(--accent);
		font-weight: 700;
		font-size: 0.8rem;
		padding: 0 0.5rem;
		border-radius: 999px;
		margin-right: 0.25rem;
	}

	.chip-warn {
		background: var(--warn-soft);
		color: var(--warn);
	}

	.ideas li {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.85rem 1rem;
	}

	.ideas li > div:first-child {
		flex: 1 1 16rem;
		min-width: 0;
	}

	.ideas li.done {
		opacity: 0.7;
	}

	.actions {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.small {
		min-height: 40px;
		padding: 0.4rem 0.9rem;
		font-size: 0.95rem;
	}

	.empty {
		color: var(--muted);
	}
</style>
