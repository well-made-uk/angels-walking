<script lang="ts">
	import { enhance } from '$app/forms';
	import { bankHoliday } from '$lib/bank-holidays';
	import { dayLabel, votingClosesLabel } from '$lib/format';
	import type { DatePoll } from '$lib/types';
	import { withWalker } from '$lib/walker.svelte';

	interface Props {
		walkId: string;
		poll: DatePoll;
		/** Days this walker has already voted for. */
		mine: string[];
		closesAt: string | null;
		saved?: boolean;
		error?: string;
	}

	let { walkId, poll, mine, closesAt, saved = false, error }: Props = $props();

	let busy = $state(false);
	// Start from what this visitor voted last time (and reset when the server
	// sends fresh data); ticking boxes overrides it locally.
	let picked = $derived([...mine]);

	const top = $derived(Math.max(0, ...poll.options.map((o) => o.votes)));
	const changed = $derived(
		picked.length !== mine.length || picked.some((d) => !mine.includes(d))
	);
</script>

<section class="poll" aria-labelledby="poll-{walkId}">
	<h4 id="poll-{walkId}">Which days could you make?</h4>
	<p class="hint">
		Tick every day that works for you. The day most people can make will be chosen
		{#if closesAt}
			after voting closes at the end of <strong>{votingClosesLabel(closesAt)}</strong>.
		{/if}
	</p>

	<form
		method="POST"
		action="?/dates"
		use:enhance={withWalker({ busy: (b) => (busy = b) })}
	>
		<input type="hidden" name="walk_id" value={walkId} />
		<ul>
			{#each poll.options as o (o.date)}
				{@const leading = top > 0 && o.votes === top}
				<li>
					<label class:checked={picked.includes(o.date)} class:leading>
						<input type="checkbox" name="dates" value={o.date} bind:group={picked} />
						<span class="day">
							{dayLabel(o.date)}
							{#if bankHoliday(o.date)}<small class="holiday" title={bankHoliday(o.date)}>Bank hol</small>{/if}
						</span>
						<span class="bar" aria-hidden="true">
							<span style="width: {top ? (o.votes / top) * 100 : 0}%"></span>
						</span>
						<span class="count">
							{o.votes}<span class="visually-hidden"> {o.votes === 1 ? 'vote' : 'votes'}</span>
						</span>
					</label>
				</li>
			{/each}
		</ul>

		<div class="actions">
			<p class="voters">
				{poll.voters === 0
					? 'No votes yet — be the first!'
					: `${poll.voters} ${poll.voters === 1 ? 'person has' : 'people have'} voted`}
			</p>
			<button class="btn btn-primary" disabled={busy}>
				{busy ? 'Saving…' : mine.length ? 'Update my days' : 'Save my days'}
			</button>
		</div>
		{#if saved && !changed}
			<p class="thanks" role="status">Thanks — your days are saved.</p>
		{/if}
		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}
	</form>
</section>

<style>
	.poll {
		border-top: 1px solid var(--border);
		padding-top: 1.1rem;
		margin-top: 1.1rem;
	}

	h4 {
		font-size: 1rem;
		margin: 0 0 0.25rem;
	}

	.hint {
		margin: 0 0 0.75rem;
		color: var(--muted);
		font-size: 0.95rem;
	}

	ul {
		list-style: none;
		padding: 0;
		margin: 0 0 0.75rem;
		display: grid;
		gap: 0.4rem;
	}

	label {
		display: grid;
		grid-template-columns: auto 7rem 1fr 2ch;
		align-items: center;
		gap: 0.75rem;
		margin: 0;
		min-height: 48px;
		padding: 0.35rem 0.8rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface);
		font-weight: 500;
		cursor: pointer;
		transition:
			border-color 0.15s,
			background 0.15s;
	}

	label:hover {
		border-color: var(--border-strong);
	}

	label.checked {
		border-color: var(--accent);
		background: var(--accent-soft);
	}

	input[type='checkbox'] {
		width: 1.35rem;
		height: 1.35rem;
		margin: 0;
		accent-color: var(--accent);
	}

	.day {
		display: flex;
		flex-direction: column;
		font-weight: 600;
		line-height: 1.2;
	}

	.holiday {
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--trail);
	}

	.bar {
		height: 0.4rem;
		border-radius: 999px;
		background: var(--surface-2);
		overflow: hidden;
	}

	.bar span {
		display: block;
		height: 100%;
		background: var(--border-strong);
		border-radius: inherit;
		transition: width 0.3s;
	}

	.leading .bar span {
		background: var(--trail);
	}

	.leading .count {
		color: var(--trail);
	}

	.count {
		text-align: right;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem 1rem;
	}

	.voters {
		margin: 0;
		color: var(--muted);
	}

	.thanks {
		margin: 0.5rem 0 0;
		color: var(--accent);
		font-weight: 600;
	}
</style>
