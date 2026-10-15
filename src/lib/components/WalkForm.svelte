<script lang="ts">
	import { enhance } from '$app/forms';
	import { bankHoliday } from '$lib/bank-holidays';
	import { dayLabel, monthLabel } from '$lib/format';
	import type { WalkFormErrors, WalkFormValues } from '$lib/types';
	import {
		addDays,
		daysBetween,
		defaultVoteDays,
		isWeekend,
		firstVotingDay,
		iso,
		lastVotingDay,
		MAX_RANGE_DAYS,
		monthEnd,
		parseDay
	} from '$lib/walks';

	interface Props {
		values: WalkFormValues;
		errors?: WalkFormErrors;
		imageUrl?: string | null;
		editing?: boolean;
		submitLabel: string;
	}

	let { values, errors = {}, imageUrl = null, editing = false, submitLabel }: Props = $props();

	let busy = $state(false);
	let mode = $derived(values.date_mode);

	// The vote calendar: a date range, and the days ticked within it.
	let rangeStart = $derived(values.range_start);
	let rangeEnd = $derived(values.range_end);
	let picked = $derived([...values.vote_options]);
	let customDeadline = $derived(!!values.vote_deadline);
	let deadline = $derived(values.vote_deadline);

	const rangeOk = $derived(
		!!rangeStart && !!rangeEnd && rangeEnd >= rangeStart && daysBetween(rangeStart, rangeEnd).length <= MAX_RANGE_DAYS
	);
	const sortedPicks = $derived([...picked].sort());
	const today = iso(new Date());
	const autoDeadline = $derived(sortedPicks.length ? lastVotingDay(sortedPicks[0]) : '');
	const autoPassed = $derived(!!autoDeadline && autoDeadline < today);
	// Voting opens 5 weeks before the earliest day and closes 3 weeks before it; your own
	// deadline can only be earlier than that, and not before voting opens.
	const opensDay = $derived(sortedPicks.length ? firstVotingDay(sortedPicks[0]) : '');
	const latestDeadline = $derived(autoDeadline);
	const earliestDeadline = $derived(opensDay > today ? opensDay : today);

	// Whole months covering the range, as weeks (Monday first) of days.
	const calendar = $derived.by(() => {
		if (!rangeOk) return [];
		const months: { label: string; weeks: (string | null)[][] }[] = [];
		let first = rangeStart.slice(0, 8) + '01';
		while (first <= rangeEnd) {
			const days = daysBetween(first, monthEnd(first));
			const cells: (string | null)[] = Array((parseDay(first).getUTCDay() + 6) % 7).fill(null);
			cells.push(...days);
			while (cells.length % 7) cells.push(null);
			const weeks = [];
			for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
			months.push({ label: monthLabel(first, true), weeks });
			const next = parseDay(first);
			next.setUTCMonth(next.getUTCMonth() + 1);
			first = iso(next);
		}
		return months;
	});

	// Suggest a deadline when the organiser opts in: the usual one if it's
	// still ahead, otherwise a week from today (or the latest allowed day).
	function onCustomDeadline() {
		if (!customDeadline || deadline) return;
		const inAWeek = addDays(today, 7);
		deadline = !autoPassed ? autoDeadline : inAWeek <= latestDeadline ? inAWeek : latestDeadline;
	}

	function resetDays() {
		picked = rangeOk ? defaultVoteDays(rangeStart, rangeEnd) : [];
	}

	function toggle(day: string) {
		picked = picked.includes(day) ? picked.filter((d) => d !== day) : [...picked, day];
	}
	let preview = $state<string | null>(null);
	let removeImage = $derived(values.remove_image);
	let imageNote = $state('');

	// Phone photos are often several MB. Shrink big images before upload so
	// they're quick to send and quick for walkers to load.
	const MAX_SIDE = 1800;
	async function onImage(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		imageNote = '';
		if (!file) {
			preview = null;
			return;
		}
		preview = URL.createObjectURL(file);
		removeImage = false;
		if (file.size < 1_000_000 && file.type !== 'image/heic') return;
		try {
			const bitmap = await createImageBitmap(file);
			const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
			const canvas = document.createElement('canvas');
			canvas.width = Math.round(bitmap.width * scale);
			canvas.height = Math.round(bitmap.height * scale);
			canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
			const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
			if (!blob) return;
			const smaller = new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
			const dt = new DataTransfer();
			dt.items.add(smaller);
			input.files = dt.files;
			preview = URL.createObjectURL(smaller);
			imageNote = `Resized to ${Math.round(smaller.size / 1024)} KB`;
		} catch {
			// Fall back to uploading the original; the server checks the size.
		}
	}

	const shownImage = $derived(preview ?? (removeImage ? null : imageUrl));
</script>

<form
	method="POST"
	action="?/save"
	enctype="multipart/form-data"
	class="walk-form"
	use:enhance={() => {
		busy = true;
		return async ({ update }) => {
			await update({ reset: false });
			busy = false;
		};
	}}
>
	<input type="hidden" name="suggestion_id" value={values.suggestion_id} />

	{#if errors.form}
		<p class="error" role="alert">{errors.form}</p>
	{/if}

	<fieldset>
		<legend>The walk</legend>

		<div class="field">
			<label for="title">Name</label>
			<input id="title" name="title" type="text" maxlength="120" required value={values.title} />
			{#if errors.title}<p class="field-error">{errors.title}</p>{/if}
		</div>

		<div class="field">
			<label for="description">Route description</label>
			<textarea id="description" name="description" rows="5" maxlength="2000" required
				placeholder="e.g. From the hall we follow the river path east to the old mill, cross the footbridge and loop back through Beech Wood."
				>{values.description}</textarea
			>
			{#if errors.description}<p class="field-error">{errors.description}</p>{/if}
		</div>

		<div class="field">
			<label for="route_image">Route image <span class="optional">(a rough map or screenshot)</span></label>
			{#if shownImage}
				<img class="preview" src={shownImage} alt="Route preview" />
			{/if}
			<input id="route_image" name="route_image" type="file" accept="image/jpeg,image/png,image/webp" onchange={onImage} />
			{#if imageNote}<p class="hint">{imageNote}</p>{/if}
			{#if imageUrl && !preview}
				<label class="check">
					<input type="checkbox" name="remove_image" bind:checked={removeImage} /> Remove the current image
				</label>
			{/if}
			{#if errors.route_image}<p class="field-error">{errors.route_image}</p>{/if}
		</div>

		<div class="grid">
			<div class="field">
				<label for="distance_km">Length (km)</label>
				<input id="distance_km" name="distance_km" type="number" step="0.1" min="0.1" max="100" required value={values.distance_km} />
				{#if errors.distance_km}<p class="field-error">{errors.distance_km}</p>{/if}
			</div>

			<div class="field">
				<span class="label" id="duration-label">Takes about</span>
				<div class="duration" role="group" aria-labelledby="duration-label">
					<label class="inline">
						<input name="duration_hours" type="number" min="0" max="12" value={values.duration_hours} aria-label="Hours" /> h
					</label>
					<label class="inline">
						<select name="duration_minutes" aria-label="Minutes">
							{#each ['0', '15', '30', '45'] as m}
								<option value={m} selected={values.duration_minutes === m}>{m}</option>
							{/each}
						</select> min
					</label>
				</div>
				{#if errors.duration_hours}<p class="field-error">{errors.duration_hours}</p>{/if}
			</div>
		</div>

		<div class="field">
			<span class="label" id="difficulty-label">Difficulty</span>
			<div class="pills" role="radiogroup" aria-labelledby="difficulty-label">
				{#each [['easy', 'Easy', 'Flat, gentle pace'], ['moderate', 'Moderate', 'Some hills or rough paths'], ['challenging', 'Challenging', 'Steep or long']] as [v, label, hint]}
					<label class="pill">
						<input type="radio" name="difficulty" value={v} checked={values.difficulty === v} required />
						<span><strong>{label}</strong><small>{hint}</small></span>
					</label>
				{/each}
			</div>
			{#if errors.difficulty}<p class="field-error">{errors.difficulty}</p>{/if}
		</div>
	</fieldset>

	<fieldset>
		<legend>When</legend>

		<div class="pills" role="radiogroup" aria-label="How the date is chosen">
			<label class="pill">
				<input type="radio" name="date_mode" value="vote" bind:group={mode} />
				<span><strong>Let the group vote</strong><small>on days you pick</small></span>
			</label>
			<label class="pill">
				<input type="radio" name="date_mode" value="fixed" bind:group={mode} />
				<span><strong>I’ve picked a date</strong><small>skip the vote</small></span>
			</label>
		</div>

		{#if mode === 'vote'}
			<div class="field">
				<span class="label" id="range-label">Date range</span>
				<div class="range" role="group" aria-labelledby="range-label">
					<label class="inline">
						From
						<input type="date" name="range_start" bind:value={rangeStart} onchange={resetDays} required />
					</label>
					<label class="inline">
						to
						<input type="date" name="range_end" bind:value={rangeEnd} min={rangeStart} onchange={resetDays} required />
					</label>
				</div>
				<p class="hint">Walks usually happen in Feb, Apr, Jun, Aug, Oct and Dec, but any range works.</p>
				{#if errors.range_start}<p class="field-error">{errors.range_start}</p>{/if}
			</div>

			{#if rangeOk}
				<div class="field">
					<div class="cal-head">
						<span class="label">Days to vote on</span>
						<div class="cal-actions">
							<button type="button" class="chip-btn" onclick={resetDays}>Weekends and bank holidays</button>
							<button type="button" class="chip-btn" onclick={() => (picked = [])}>Clear all</button>
						</div>
					</div>
					<p class="hint">Weekends and bank holidays are ticked for you. Tap any day to add or remove it.</p>

					{#each sortedPicks as d (d)}
						<input type="hidden" name="vote_options" value={d} />
					{/each}

					<div class="months">
						{#each calendar as m (m.label)}
							<div class="month">
								<p class="month-name">{m.label}</p>
								<div class="cal-grid" role="grid" aria-label={m.label}>
									{#each ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as wd, i (i)}
										<span class="wd" aria-hidden="true">{wd}</span>
									{/each}
									{#each m.weeks.flat() as day, i (day ?? `blank-${i}`)}
										{#if !day}
											<span></span>
										{:else}
											{@const inRange = day >= rangeStart && day <= rangeEnd}
											{@const holiday = bankHoliday(day)}
											<button
												type="button"
												class="day"
												class:picked={picked.includes(day)}
												class:weekend={isWeekend(day)}
												class:holiday={!!holiday}
												class:past={day < today}
												disabled={!inRange}
												aria-pressed={picked.includes(day)}
												aria-label="{dayLabel(day, 'long')}{holiday ? `, ${holiday}` : ''}"
												title={holiday}
												onclick={() => toggle(day)}
											>
												{Number(day.slice(8))}
											</button>
										{/if}
									{/each}
								</div>
							</div>
						{/each}
					</div>

					<p class="legend">
						<span class="key key-picked"></span> On the vote
						<span class="key key-holiday"></span> Bank holiday
					</p>

					{#if errors.vote_options}<p class="field-error">{errors.vote_options}</p>{/if}
				</div>

				{#if sortedPicks.length}
					<div class="field deadline">
						<span class="label">Voting deadline</span>
						<p class="hint summary">
							<strong>{sortedPicks.length} day{sortedPicks.length === 1 ? '' : 's'}</strong> on the vote.
							{#if customDeadline && deadline}
								Voting closes at the end of <strong>{dayLabel(deadline, 'long')}</strong>, then the most popular day
								is locked in.
							{:else if autoPassed}
								Voting closes 3 weeks before the earliest day, which was
								<strong>{dayLabel(autoDeadline, 'long')}</strong>, so there's no time left for a vote. Untick the
								earliest days, or choose a fixed date instead.
							{:else}
								Voting opens on <strong>{dayLabel(opensDay, 'long')}</strong> (5 weeks before the earliest day) and
								closes at the end of <strong>{dayLabel(autoDeadline, 'long')}</strong> (3 weeks before), then the
								most popular day is locked in.
							{/if}
						</p>
						{#if !autoPassed}
							<label class="check">
								<input type="checkbox" name="custom_deadline" bind:checked={customDeadline} onchange={onCustomDeadline} />
								Choose an earlier deadline
							</label>
						{/if}
						{#if customDeadline && !autoPassed}
							<label class="inline deadline-date">
								Last day to vote
								<input
									type="date"
									name="vote_deadline"
									bind:value={deadline}
									min={earliestDeadline}
									max={latestDeadline}
									required
								/>
							</label>
							<p class="hint">
								Any day from {dayLabel(earliestDeadline, 'long')} up to {dayLabel(latestDeadline, 'long')}. Voting
								closes at midnight.
							</p>
						{/if}
						{#if errors.vote_deadline}<p class="field-error">{errors.vote_deadline}</p>{/if}
					</div>
				{/if}
			{/if}
		{:else}
			<div class="field">
				<label for="walk_date">Date</label>
				<input id="walk_date" name="walk_date" type="date" value={values.walk_date} required />
				{#if errors.walk_date}<p class="field-error">{errors.walk_date}</p>{/if}
			</div>
		{/if}

		<div class="grid">
			<div class="field">
				<label for="start_time">Start time</label>
				<input id="start_time" name="start_time" type="time" required value={values.start_time} />
				{#if errors.start_time}<p class="field-error">{errors.start_time}</p>{/if}
			</div>
			<div class="field">
				<label for="max_people">People limit <span class="optional">(optional)</span></label>
				<input id="max_people" name="max_people" type="number" min="1" value={values.max_people} placeholder="No limit" />
				{#if errors.max_people}<p class="field-error">{errors.max_people}</p>{/if}
			</div>
		</div>

		<div class="field">
			<label for="meeting_point">Meeting point</label>
			<input id="meeting_point" name="meeting_point" type="text" maxlength="200" required value={values.meeting_point}
				placeholder="A place name or postcode – it links to OpenStreetMap" />
			{#if errors.meeting_point}<p class="field-error">{errors.meeting_point}</p>{/if}
		</div>

		<div class="field">
			<label for="notes">Good to know <span class="optional">(optional)</span></label>
			<textarea id="notes" name="notes" rows="2" maxlength="1000"
				placeholder="Footwear, parking, café stop, dogs welcome…">{values.notes}</textarea>
		</div>

		{#if editing}
			<label class="check">
				<input type="checkbox" name="cancelled" checked={values.cancelled} /> This walk is cancelled
			</label>
		{/if}
	</fieldset>

	<div class="submit">
		<button class="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
		<a href="/organiser">Cancel</a>
	</div>
</form>

<style>
	.walk-form {
		display: grid;
		gap: 1.5rem;
	}

	fieldset {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		padding: 1.25rem;
		margin: 0;
		display: grid;
		gap: 1.1rem;
		min-width: 0;
	}

	legend {
		font-weight: 700;
		font-size: 1.1rem;
		padding: 0 0.4rem;
	}

	.field {
		display: grid;
		gap: 0.1rem;
		min-width: 0;
	}

	.label {
		display: block;
		font-weight: 600;
		margin-bottom: 0.35rem;
	}

	.optional {
		font-weight: 400;
		color: var(--muted);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
		gap: 1.1rem;
	}

	.duration {
		display: flex;
		gap: 0.75rem;
	}

	.inline {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-weight: 500;
		margin: 0;
	}

	.inline input {
		width: 5rem;
	}

	.inline select {
		width: 5rem;
	}

	.pills {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
		gap: 0.5rem;
	}

	.pill {
		display: flex;
		gap: 0.6rem;
		align-items: flex-start;
		border: 1.5px solid var(--border);
		border-radius: 10px;
		padding: 0.65rem 0.75rem;
		margin: 0;
		cursor: pointer;
		font-weight: 400;
	}

	.pill:has(input:checked) {
		border-color: var(--accent);
		background: var(--accent-soft);
	}

	.pill input {
		margin-top: 0.3rem;
		accent-color: var(--accent);
	}

	.pill span {
		display: grid;
	}

	.pill small {
		color: var(--muted);
	}

	.check {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		font-weight: 500;
		margin-top: 0.4rem;
	}

	.hint {
		margin: 0.35rem 0 0;
		color: var(--muted);
		font-size: 0.95rem;
	}

	.field-error {
		margin: 0.3rem 0 0;
		color: var(--warn);
		font-weight: 600;
		font-size: 0.95rem;
	}

	.preview {
		display: block;
		max-width: 100%;
		max-height: 16rem;
		border-radius: 10px;
		border: 1px solid var(--border);
		margin-bottom: 0.5rem;
	}

	input[type='file'] {
		max-width: 100%;
	}

	.range {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}

	.range .inline input {
		width: auto;
	}

	.cal-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.cal-head .label {
		margin: 0;
	}

	.cal-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.chip-btn {
		border: 1px solid var(--border-strong);
		background: var(--surface);
		border-radius: 999px;
		padding: 0.3rem 0.8rem;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
	}

	.chip-btn:hover {
		border-color: var(--accent);
	}

	.months {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
		gap: 1rem 1.5rem;
		margin-top: 0.75rem;
	}

	.month-name {
		margin: 0 0 0.4rem;
		font-weight: 700;
	}

	.cal-grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 0.25rem;
	}

	.wd {
		text-align: center;
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--muted);
		padding-bottom: 0.1rem;
	}

	.day {
		position: relative;
		aspect-ratio: 1;
		min-height: 2.2rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--surface);
		font-size: 0.9rem;
		font-weight: 500;
		font-variant-numeric: tabular-nums;
		cursor: pointer;
		padding: 0;
	}

	.day.weekend {
		background: var(--surface-2);
	}

	.day.holiday::after {
		content: '';
		position: absolute;
		top: 4px;
		right: 4px;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--trail);
	}

	.day.picked {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-contrast);
		font-weight: 700;
	}

	.day.picked.holiday::after {
		background: var(--accent-contrast);
	}

	.day.past:not(:disabled) {
		color: var(--muted);
	}

	.day:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
		margin: 0.75rem 0 0;
		font-size: 0.85rem;
		color: var(--muted);
	}

	.key {
		width: 0.9rem;
		height: 0.9rem;
		border-radius: 4px;
		display: inline-block;
	}

	.key-picked {
		background: var(--accent);
	}

	.key-holiday {
		margin-left: 0.8rem;
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: var(--trail);
	}

	.summary {
		margin-top: 0.1rem;
	}

	.deadline-date {
		margin-top: 0.6rem;
		flex-wrap: wrap;
	}

	.deadline-date input {
		width: auto;
	}

	.submit {
		display: flex;
		gap: 1rem;
		align-items: center;
	}
</style>
