<script lang="ts">
	import { enhance } from '$app/forms';
	import { clockLabel, dayRangeLabel, duration, mapLink, walkDate, walkTime } from '$lib/format';
	import { voteDays } from '$lib/walks';
	import type { DatePoll as Poll, FeedWalk } from '$lib/types';
	import DatePoll from './DatePoll.svelte';
	import { withWalker } from '$lib/walker.svelte';

	interface Props {
		walk: FeedWalk;
		joined: boolean;
		featured?: boolean;
		poll?: Poll;
		/** Days this walker has voted for, if the date is being voted on. */
		myDates?: string[];
		saved?: boolean;
		error?: string;
	}

	let { walk, joined, featured = false, poll, myDates = [], saved = false, error }: Props = $props();

	let busy = $state(false);

	const going = $derived(walk.signups.length);
	const spacesLeft = $derived(walk.max_people == null ? null : walk.max_people - going);
	const full = $derived(spacesLeft !== null && spacesLeft <= 0);
	const voting = $derived(!walk.walk_date);
	const started = $derived(!!walk.starts_at && new Date(walk.starts_at).getTime() < Date.now());
	const canJoin = $derived(!walk.cancelled && !started && !full);

	const submit = withWalker({ busy: (b) => (busy = b) });
</script>

<article class="walk" class:featured class:cancelled={walk.cancelled} aria-labelledby="walk-{walk.id}">
	<header>
		<p class="eyebrow">
			{#if walk.starts_at}
				{walkDate(walk.starts_at)} · {walkTime(walk.starts_at)}
			{:else}
				{dayRangeLabel(voteDays(walk))} · day to be decided
			{/if}
		</p>
		<h3 id="walk-{walk.id}">{walk.title}</h3>
		{#if walk.cancelled}
			<p class="badge badge-warn">Cancelled</p>
		{/if}
	</header>

	{#if walk.route_image_url}
		<a class="route-img" href={walk.route_image_url} target="_blank" rel="noopener">
			<img src={walk.route_image_url} alt="Rough map of the route for {walk.title}" loading="lazy" />
			<span>Tap to enlarge</span>
		</a>
	{/if}

	<dl class="facts">
		<div class="fact fact-wide">
			<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
			<div>
				<dt>Meet at</dt>
				<dd><a href={mapLink(walk.meeting_point)} target="_blank" rel="noopener">{walk.meeting_point}</a></dd>
			</div>
		</div>
		{#if !walk.starts_at}
			<div class="fact">
				<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
				<div>
					<dt>Starts</dt>
					<dd>{clockLabel(walk.start_time)}</dd>
				</div>
			</div>
		{/if}
		{#if walk.distance_km}
			<div class="fact">
				<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19c3-6 6 2 9-4s5-8 7-10" /><circle cx="4" cy="19" r="1.6" /><circle cx="20" cy="5" r="1.6" /></svg>
				<div>
					<dt>Distance</dt>
					<dd>{Number(walk.distance_km)} km</dd>
				</div>
			</div>
		{/if}
		{#if walk.duration_mins}
			<div class="fact">
				<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9" /></svg>
				<div>
					<dt>Duration</dt>
					<dd>{duration(walk.duration_mins)}</dd>
				</div>
			</div>
		{/if}
		{#if walk.difficulty}
			<div class="fact">
				<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 19l6-10 4 6 2-3 6 7z" /></svg>
				<div>
					<dt>Difficulty</dt>
					<dd class="cap">{walk.difficulty}</dd>
				</div>
			</div>
		{/if}
	</dl>

	{#if walk.description}
		<h4 class="label">The route</h4>
		<p class="desc">{walk.description}</p>
	{/if}
	{#if walk.notes}
		<p class="notes"><strong>Good to know</strong> {walk.notes}</p>
	{/if}
	{#if walk.suggested_by}
		<p class="credit">Suggested by {walk.suggested_by}</p>
	{/if}

	{#if voting && poll && !walk.cancelled}
		<DatePoll walkId={walk.id} {poll} mine={myDates} opensAt={walk.votes_open_at} closesAt={walk.votes_close_at} {saved} {error} />
	{:else}
		<section class="people" aria-label="Who's going">
			<h4>
				{going === 0 ? 'No one signed up yet' : `${going} going`}
				{#if spacesLeft !== null && !walk.cancelled}
					<span class="spaces" class:low={spacesLeft <= 3}>
						· {full ? 'Full' : `${spacesLeft} space${spacesLeft === 1 ? '' : 's'} left`}
					</span>
				{/if}
			</h4>
			{#if going > 0}
				<ul class="names">
					{#each walk.signups as s (s.id)}
						<li><span class="initial" aria-hidden="true">{s.name.trim().charAt(0).toUpperCase()}</span>{s.name}</li>
					{/each}
				</ul>
			{/if}
		</section>

		{#if joined}
			<form method="POST" action="?/leave" class="going" use:enhance={submit}>
				<p>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
					You're on the list
				</p>
				<input type="hidden" name="walk_id" value={walk.id} />
				<button class="btn btn-ghost" disabled={busy}>
					{busy ? 'Removing…' : "Can't make it? Remove me"}
				</button>
			</form>
		{:else if canJoin}
			<form method="POST" action="?/join" class="join" use:enhance={submit}>
				<input type="hidden" name="walk_id" value={walk.id} />
				<button class="btn btn-primary" disabled={busy}>
					{busy ? 'Adding…' : 'Count me in'}
				</button>
			</form>
		{:else if full && !walk.cancelled}
			<p class="muted">This walk is full. Keep an eye out for the next one.</p>
		{/if}

		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}
	{/if}
</article>

<style>
	.walk {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1.4rem;
		box-shadow: var(--shadow);
	}

	.featured {
		padding: 1.6rem;
		border-color: var(--border-strong);
		box-shadow:
			inset 0 3px 0 var(--trail),
			var(--shadow);
	}

	.cancelled {
		opacity: 0.7;
	}

	.cancelled h3 {
		text-decoration: line-through;
	}

	header {
		margin-bottom: 1.1rem;
	}

	header .eyebrow {
		margin-bottom: 0.4rem;
	}

	h3 {
		font-size: 1.35rem;
	}

	.featured h3 {
		font-size: 1.65rem;
	}

	.badge {
		display: inline-block;
		margin: 0.6rem 0 0;
		padding: 0.15rem 0.65rem;
		border-radius: 999px;
		font-size: 0.8rem;
		font-weight: 700;
	}

	.badge-warn {
		background: var(--warn-soft);
		color: var(--warn);
	}

	.route-img {
		display: block;
		position: relative;
		margin: 0 0 1.1rem;
		border-radius: var(--radius-sm);
		overflow: hidden;
		border: 1px solid var(--border);
		background: var(--surface-2);
	}

	.route-img img {
		display: block;
		width: 100%;
		max-height: 24rem;
		object-fit: contain;
	}

	.route-img span {
		position: absolute;
		right: 0.6rem;
		bottom: 0.6rem;
		background: rgb(12 28 22 / 0.7);
		color: #fff;
		font-size: 0.78rem;
		font-weight: 600;
		padding: 0.2rem 0.6rem;
		border-radius: 999px;
	}

	.facts {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(8.5rem, 1fr));
		gap: 0.5rem;
		margin: 0 0 1.2rem;
	}

	.fact {
		display: flex;
		align-items: flex-start;
		gap: 0.6rem;
		background: var(--surface-2);
		border-radius: var(--radius-sm);
		padding: 0.65rem 0.8rem;
	}

	.fact-wide {
		grid-column: 1 / -1;
	}

	.icon {
		flex: none;
		width: 1.25rem;
		height: 1.25rem;
		margin-top: 0.15rem;
		fill: none;
		stroke: var(--trail);
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	dt {
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--muted);
		font-weight: 700;
	}

	dd {
		margin: 0;
		font-weight: 600;
	}

	.cap {
		text-transform: capitalize;
	}

	.label {
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--muted);
		margin: 0 0 0.25rem;
	}

	.desc,
	.notes,
	.credit {
		margin: 0 0 0.85rem;
	}

	.desc {
		white-space: pre-line;
	}

	.notes {
		color: var(--muted);
		padding-left: 0.8rem;
		border-left: 2px solid var(--border-strong);
	}

	.notes strong {
		display: block;
		color: var(--text);
		font-size: 0.9rem;
	}

	.credit {
		font-size: 0.9rem;
		color: var(--muted);
		font-style: italic;
	}

	.people {
		border-top: 1px solid var(--border);
		padding-top: 1.1rem;
		margin-top: 1.1rem;
	}

	h4 {
		font-size: 1rem;
		margin: 0 0 0.6rem;
	}

	.spaces {
		font-weight: 500;
		color: var(--muted);
	}

	.spaces.low {
		color: var(--trail);
	}

	.names {
		list-style: none;
		padding: 0;
		margin: 0 0 1.1rem;
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.names li {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 0.15rem 0.7rem 0.15rem 0.2rem;
		font-size: 0.92rem;
	}

	.initial {
		display: grid;
		place-items: center;
		width: 1.45rem;
		height: 1.45rem;
		border-radius: 50%;
		background: var(--accent);
		color: var(--accent-contrast);
		font-size: 0.72rem;
		font-weight: 700;
	}

	.join .btn {
		width: 100%;
	}

	.going {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.5rem 1rem;
		background: var(--accent-soft);
		border-radius: var(--radius-sm);
		padding: 0.6rem 0.6rem 0.6rem 1rem;
	}

	.going p {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		margin: 0;
		font-weight: 700;
		color: var(--accent-strong);
	}

	.going svg {
		width: 1.2rem;
		height: 1.2rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.4;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.muted {
		color: var(--muted);
		margin: 0;
	}
</style>
