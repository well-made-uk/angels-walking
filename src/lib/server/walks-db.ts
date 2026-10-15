import type { Difficulty, Feed, FeedWalk, OrganiserSuggestion, Walk } from '$lib/types';
import { addDays, MAX_VOTE_DAYS, VOTE_LEAD_DAYS } from '$lib/walks';
import {
	ID,
	Query,
	ROUTE_BUCKET,
	createRow,
	deleteRow,
	deleteWhere,
	getRow,
	isConflict,
	listAll,
	storage,
	updateRow,
	type Row
} from '$lib/server/appwrite';
import { londonToUtc } from '$lib/server/time';
import { UserError, requireWalker } from '$lib/server/walkers';

export interface WalkData {
	title: string;
	description: string | null;
	meeting_point: string;
	start_time: string;
	walk_date: string | null;
	walk_month: string;
	vote_options: string[] | null;
	vote_deadline: string | null;
	starts_at: string | null;
	votes_close_at: string | null;
	distance_km: number | null;
	duration_mins: number | null;
	difficulty: Difficulty | null;
	max_people: number | null;
	notes: string | null;
	cancelled: boolean;
	route_image_id: string | null;
	suggestion_id: string | null;
}
export type WalkRow = Row<WalkData>;

interface SignupData {
	walk_id: string;
	name: string;
	walker_email: string;
}
interface SuggestionData {
	title: string;
	details: string | null;
	suggested_by: string | null;
	walker_email: string;
}
interface SuggestionVoteData {
	suggestion_id: string;
	walker_email: string;
}
interface DateVoteData {
	walk_id: string;
	vote_date: string;
	walker_email: string;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

// Route images are served through /api/route-image/<id>. The file id is random
// and only ever sent to logged-in walkers and organisers.
export const routeImageUrl = (id: string | null | undefined) => (id ? `/api/route-image/${id}` : null);

// ---------------------------------------------------------------------------
// Walk dates

/**
 * Work out the fields derived from a walk's date settings. A walk with a date
 * gets its month and start time; a walk being voted on gets its month from the
 * first day on offer and a closing time (midnight at the end of the last voting
 * day, UK time).
 */
export function deriveWalkFields(w: {
	walk_date: string | null;
	start_time: string;
	vote_options: string[] | null;
	vote_deadline: string | null;
}) {
	if (w.walk_date) {
		return {
			walk_month: `${w.walk_date.slice(0, 7)}-01`,
			starts_at: londonToUtc(w.walk_date, w.start_time).toISOString(),
			votes_close_at: null as string | null,
			vote_options: null as string[] | null
		};
	}

	const options = [...new Set((w.vote_options ?? []).filter((d) => ISO_DAY.test(d)))].sort();
	if (!options.length) throw new UserError('Pick at least one day for people to vote on');
	if (options.length > MAX_VOTE_DAYS) throw new UserError(`That's a lot of days - pick ${MAX_VOTE_DAYS} or fewer`);
	const first = options[0];
	if (w.vote_deadline && w.vote_deadline >= first) {
		throw new UserError('The voting deadline needs to be before the first day on offer');
	}
	const lastDay = w.vote_deadline || addDays(first, -VOTE_LEAD_DAYS - 1);
	return {
		walk_month: `${first.slice(0, 7)}-01`,
		starts_at: null as string | null,
		votes_close_at: londonToUtc(addDays(lastDay, 1)).toISOString(),
		vote_options: options
	};
}

// ---------------------------------------------------------------------------
// Reading walks

const bySignupOrder = (a: Row<SignupData>, b: Row<SignupData>) => a.$createdAt.localeCompare(b.$createdAt);

/**
 * Walkers' current names, keyed by email. Sign-ups and ideas keep a copy of the name
 * from when they were made, but the walker record is the one that gets corrected, so
 * names shown in the app come from here and the stored copy is only a fallback.
 */
async function currentNames(emails: Iterable<string>) {
	const wanted = [...new Set(emails)].filter(Boolean);
	const names = new Map<string, string>();
	for (let i = 0; i < wanted.length; i += 100) {
		const chunk = wanted.slice(i, i + 100);
		const rows = await listAll<{ email: string; name: string | null }>('walkers', [Query.equal('email', chunk)]);
		for (const w of rows) if (w.name) names.set(w.email, w.name);
	}
	return names;
}

/** A walk with its sign-ups and the person who suggested it (organiser pages). */
export async function loadWalk(id: string): Promise<Walk | null> {
	const row = await getRow<WalkData>('walks', id);
	if (!row) return null;
	const [signups, suggestion] = await Promise.all([
		listAll<SignupData>('signups', [Query.equal('walk_id', id)]),
		row.suggestion_id ? getRow<SuggestionData>('suggestions', row.suggestion_id) : null
	]);
	const names = await currentNames([...signups.map((s) => s.walker_email), suggestion?.walker_email ?? '']);
	return {
		id: row.$id,
		title: row.title,
		description: row.description,
		starts_at: row.starts_at,
		walk_date: row.walk_date,
		walk_month: row.walk_month,
		vote_options: row.vote_options,
		vote_deadline: row.vote_deadline,
		start_time: row.start_time,
		votes_close_at: row.votes_close_at,
		meeting_point: row.meeting_point,
		distance_km: row.distance_km,
		duration_mins: row.duration_mins,
		difficulty: row.difficulty,
		max_people: row.max_people,
		notes: row.notes,
		cancelled: row.cancelled,
		route_image_id: row.route_image_id,
		route_image_url: routeImageUrl(row.route_image_id),
		suggestion_id: row.suggestion_id,
		suggestion: suggestion
			? { suggested_by: names.get(suggestion.walker_email) ?? suggestion.suggested_by }
			: null,
		signups: signups
			.sort(bySignupOrder)
			.map((s) => ({ id: s.$id, name: names.get(s.walker_email) ?? s.name, created_at: s.$createdAt }))
	};
}

/** Upcoming walk months, noting which already have a (non-cancelled) walk. */
export async function walkMonthsInUse(from: string) {
	const rows = await listAll<WalkData>('walks', [Query.equal('cancelled', false), Query.greaterThanEqual('walk_month', from)]);
	return rows.map((w) => ({ id: w.$id, walk_month: w.walk_month }));
}

// ---------------------------------------------------------------------------
// Date votes

/** Close the vote and fix the date: the most popular day, ties to the earliest. */
export async function lockWalk(walkId: string, { force = false } = {}) {
	const w = await getRow<WalkData>('walks', walkId);
	if (!w || w.walk_date) return w?.walk_date ?? null;
	if (!force && w.votes_close_at && new Date(w.votes_close_at).getTime() > Date.now()) return null;

	const votes = await listAll<DateVoteData>('date_votes', [Query.equal('walk_id', walkId)]);
	const counts = new Map<string, number>();
	for (const v of votes) counts.set(v.vote_date, (counts.get(v.vote_date) ?? 0) + 1);
	const best = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
	const pick = best ?? [...(w.vote_options ?? [])].sort()[0];
	if (!pick) return null;

	await updateRow('walks', walkId, {
		walk_date: pick,
		...deriveWalkFields({ walk_date: pick, start_time: w.start_time, vote_options: null, vote_deadline: null })
	});
	return pick;
}

/** Locks in any walk whose voting has closed. Called whenever someone loads walks. */
export async function lockDueWalks() {
	const due = await listAll<WalkData>('walks', [
		Query.isNull('walk_date'),
		Query.equal('cancelled', false),
		Query.lessThanEqual('votes_close_at', new Date().toISOString())
	]);
	for (const w of due) await lockWalk(w.$id);
	return due.length;
}

export async function dateTallies(walkId: string) {
	const votes = await listAll<DateVoteData>('date_votes', [Query.equal('walk_id', walkId)]);
	const counts = new Map<string, number>();
	for (const v of votes) counts.set(v.vote_date, (counts.get(v.vote_date) ?? 0) + 1);
	return { counts, voters: new Set(votes.map((v) => v.walker_email)).size };
}

export async function setDateVotes(walkId: string, dates: string[], email: unknown, token: unknown) {
	const me = await requireWalker(email, token);
	const w = await getRow<WalkData>('walks', walkId);
	if (!w) throw new UserError('Walk not found');
	if (w.cancelled || w.walk_date || (w.votes_close_at && new Date(w.votes_close_at).getTime() <= Date.now())) {
		throw new UserError('Voting for this walk has closed');
	}
	const unique = [...new Set(dates)];
	const allowed = new Set(w.vote_options ?? []);
	if (unique.some((d) => !allowed.has(d))) throw new UserError('Please pick from the days on offer');

	await deleteWhere('date_votes', [Query.equal('walk_id', walkId), Query.equal('walker_email', me.email)]);
	for (const d of unique) {
		await createRow('date_votes', ID.unique(), { walk_id: walkId, vote_date: d, walker_email: me.email });
	}
}

// ---------------------------------------------------------------------------
// Sign-ups

export async function joinWalk(walkId: string, email: unknown, token: unknown) {
	const me = await requireWalker(email, token);
	const w = await getRow<WalkData>('walks', walkId);
	if (!w) throw new UserError('Walk not found');
	if (w.cancelled) throw new UserError('This walk has been cancelled');
	if (!w.walk_date) throw new UserError("The date hasn't been decided yet - vote for the days you can make");
	if (w.starts_at && new Date(w.starts_at).getTime() < Date.now()) throw new UserError('This walk has already started');

	const signups = await listAll<SignupData>('signups', [Query.equal('walk_id', walkId)]);
	const mine = signups.find((s) => s.walker_email === me.email);
	if (w.max_people != null && !mine && signups.length >= w.max_people) throw new UserError('Sorry, this walk is full');

	if (mine) {
		await updateRow('signups', mine.$id, { name: me.name });
		return;
	}
	try {
		await createRow('signups', ID.unique(), { walk_id: walkId, name: me.name, walker_email: me.email });
	} catch (e) {
		// A double tap: the unique index already has them down.
		if (!isConflict(e)) throw e;
	}
}

export async function leaveWalk(walkId: string, email: unknown, token: unknown) {
	const me = await requireWalker(email, token);
	await deleteWhere('signups', [Query.equal('walk_id', walkId), Query.equal('walker_email', me.email)]);
}

// ---------------------------------------------------------------------------
// Suggestions

export async function addSuggestion(title: string, details: string, email: unknown, token: unknown) {
	const me = await requireWalker(email, token);
	const recent = await listAll<SuggestionData>('suggestions', [
		Query.equal('walker_email', me.email),
		Query.greaterThan('$createdAt', new Date(Date.now() - DAY).toISOString())
	]);
	if (recent.length >= 5) throw new UserError("That's plenty of ideas for today - thank you!");

	const id = ID.unique();
	await createRow('suggestions', id, {
		title: title.trim(),
		details: details.trim() || null,
		suggested_by: me.name,
		walker_email: me.email
	});
	await createRow('suggestion_votes', ID.unique(), { suggestion_id: id, walker_email: me.email });
}

export async function toggleVote(suggestionId: string, email: unknown, token: unknown) {
	const me = await requireWalker(email, token);
	const existing = await listAll<SuggestionVoteData>('suggestion_votes', [
		Query.equal('suggestion_id', suggestionId),
		Query.equal('walker_email', me.email)
	]);
	if (existing.length) {
		for (const v of existing) await deleteRow('suggestion_votes', v.$id);
		return false;
	}
	if (!(await getRow('suggestions', suggestionId))) throw new UserError('That idea no longer exists');
	try {
		await createRow('suggestion_votes', ID.unique(), { suggestion_id: suggestionId, walker_email: me.email });
	} catch (e) {
		if (!isConflict(e)) throw e;
	}
	return true;
}

/** Remove an idea with its hearts. Any walk planned from it stays, just unlinked. */
export async function removeSuggestion(suggestionId: string) {
	await deleteWhere('suggestion_votes', [Query.equal('suggestion_id', suggestionId)]);
	for (const w of await listAll<WalkData>('walks', [Query.equal('suggestion_id', suggestionId)])) {
		await updateRow('walks', w.$id, { suggestion_id: null });
	}
	await deleteRow('suggestions', suggestionId);
}

/** Walkers can only remove their own ideas. */
export async function deleteOwnSuggestion(suggestionId: string, email: unknown, token: unknown) {
	const me = await requireWalker(email, token);
	const s = await getRow<SuggestionData>('suggestions', suggestionId);
	if (s && s.walker_email === me.email) await removeSuggestion(suggestionId);
}

/** Every idea with its hearts, and whether a walk has been planned from it. */
export async function suggestionsView(): Promise<(OrganiserSuggestion & { walker_email: string })[]> {
	const [ideas, hearts, planned] = await Promise.all([
		listAll<SuggestionData>('suggestions'),
		listAll<SuggestionVoteData>('suggestion_votes'),
		listAll<WalkData>('walks', [Query.equal('cancelled', false), Query.isNotNull('suggestion_id')])
	]);
	const votes = new Map<string, number>();
	for (const h of hearts) votes.set(h.suggestion_id, (votes.get(h.suggestion_id) ?? 0) + 1);
	const promoted = new Set(planned.map((w) => w.suggestion_id));
	const names = await currentNames(ideas.map((s) => s.walker_email));
	return ideas.map((s) => ({
		id: s.$id,
		title: s.title,
		details: s.details,
		created_at: s.$createdAt,
		votes: votes.get(s.$id) ?? 0,
		promoted: promoted.has(s.$id),
		suggested_by: names.get(s.walker_email) ?? s.suggested_by,
		walker_email: s.walker_email
	}));
}

// ---------------------------------------------------------------------------
// What a logged-in walker sees

const stripEmail = ({ walker_email: _email, ...rest }: OrganiserSuggestion & { walker_email: string }) => rest;

/** The next walks and the open ideas. Only call this after checking the walker's token. */
export async function walkerFeed(maxWalks = 2): Promise<Feed> {
	await lockDueWalks();

	const since = new Date(Date.now() - 3 * HOUR).toISOString();
	const rows = await listAll<WalkData>('walks', [
		Query.or([Query.isNull('walk_date'), Query.greaterThanEqual('starts_at', since)])
	]);
	const sortKey = (w: WalkData) => new Date(w.starts_at ?? w.walk_month).getTime();
	const shown = rows.sort((a, b) => sortKey(a) - sortKey(b)).slice(0, Math.max(1, Math.min(maxWalks, 12)));

	const ids = shown.map((w) => w.$id);
	const [signups, votes, ideas] = await Promise.all([
		ids.length ? listAll<SignupData>('signups', [Query.equal('walk_id', ids)]) : [],
		ids.length ? listAll<DateVoteData>('date_votes', [Query.equal('walk_id', ids)]) : [],
		suggestionsView()
	]);
	const authors = new Map(ideas.map((s) => [s.id, s.suggested_by]));
	const names = await currentNames(signups.map((s) => s.walker_email));

	const walks: FeedWalk[] = shown.map((w) => {
		const mine = votes.filter((v) => v.walk_id === w.$id);
		const counts = new Map<string, number>();
		for (const v of mine) counts.set(v.vote_date, (counts.get(v.vote_date) ?? 0) + 1);
		return {
			id: w.$id,
			title: w.title,
			description: w.description,
			starts_at: w.starts_at,
			walk_date: w.walk_date,
			walk_month: w.walk_month,
			vote_options: w.vote_options,
			start_time: w.start_time,
			votes_close_at: w.votes_close_at,
			meeting_point: w.meeting_point,
			distance_km: w.distance_km,
			duration_mins: w.duration_mins,
			difficulty: w.difficulty,
			max_people: w.max_people,
			notes: w.notes,
			cancelled: w.cancelled,
			route_image_url: routeImageUrl(w.route_image_id),
			suggested_by: (w.suggestion_id && authors.get(w.suggestion_id)) || null,
			signups: signups
				.filter((s) => s.walk_id === w.$id)
				.sort(bySignupOrder)
				.map((s) => ({ id: s.$id, name: names.get(s.walker_email) ?? s.name, created_at: s.$createdAt })),
			tallies: w.walk_date
				? []
				: [...counts].sort((a, b) => a[0].localeCompare(b[0])).map(([date, n]) => ({ date, votes: n })),
			voters: new Set(mine.map((v) => v.walker_email)).size
		};
	});

	const open = ideas
		.filter((s) => !s.promoted)
		.sort((a, b) => b.votes - a.votes || b.created_at.localeCompare(a.created_at))
		.map(stripEmail);
	return { walks, suggestions: open };
}

/** What this walker has joined, hearted, suggested and voted for. */
export async function myActivity(email: string) {
	const [signups, hearts, ideas, dates] = await Promise.all([
		listAll<SignupData>('signups', [Query.equal('walker_email', email)]),
		listAll<SuggestionVoteData>('suggestion_votes', [Query.equal('walker_email', email)]),
		listAll<SuggestionData>('suggestions', [Query.equal('walker_email', email)]),
		listAll<DateVoteData>('date_votes', [Query.equal('walker_email', email)])
	]);
	return [
		...signups.map((s) => ({ kind: 'walk', ref_id: s.walk_id, vote_date: null as string | null })),
		...hearts.map((h) => ({ kind: 'vote', ref_id: h.suggestion_id, vote_date: null })),
		...ideas.map((s) => ({ kind: 'suggestion', ref_id: s.$id, vote_date: null })),
		...dates.map((d) => ({ kind: 'date', ref_id: d.walk_id, vote_date: d.vote_date }))
	];
}

// ---------------------------------------------------------------------------
// Organisers

export async function attendees(walkId: string) {
	const signups = await listAll<SignupData>('signups', [Query.equal('walk_id', walkId)]);
	const names = await currentNames(signups.map((s) => s.walker_email));
	return signups
		.sort(bySignupOrder)
		.map((s) => ({ id: s.$id, name: names.get(s.walker_email) ?? s.name, email: s.walker_email, created_at: s.$createdAt }));
}

export interface DashboardWalk {
	id: string;
	title: string;
	starts_at: string | null;
	walk_date: string | null;
	walk_month: string;
	vote_options: string[] | null;
	votes_close_at: string | null;
	cancelled: boolean;
	max_people: number | null;
	signups: { id: string }[];
}

export async function dashboardWalks() {
	await lockDueWalks();
	const since = new Date(Date.now() - DAY).toISOString();
	const [upcoming, past] = await Promise.all([
		listAll<WalkData>('walks', [Query.or([Query.isNull('walk_date'), Query.greaterThanEqual('starts_at', since)])]),
		listAll<WalkData>('walks', [Query.lessThan('starts_at', since), Query.orderDesc('starts_at')]).then((rows) =>
			rows.slice(0, 6)
		)
	]);
	const all = [...upcoming, ...past];
	const signups = all.length ? await listAll<SignupData>('signups', [Query.equal('walk_id', all.map((w) => w.$id))]) : [];
	const shape = (w: Row<WalkData>): DashboardWalk => ({
		id: w.$id,
		title: w.title,
		starts_at: w.starts_at,
		walk_date: w.walk_date,
		walk_month: w.walk_month,
		vote_options: w.vote_options,
		votes_close_at: w.votes_close_at,
		cancelled: w.cancelled,
		max_people: w.max_people,
		signups: signups.filter((s) => s.walk_id === w.$id).map((s) => ({ id: s.$id }))
	});
	const order = (a: WalkData, b: WalkData) =>
		a.walk_month.localeCompare(b.walk_month) || (a.starts_at ?? '').localeCompare(b.starts_at ?? '');
	return { walks: upcoming.sort(order).map(shape), past: past.map(shape) };
}

/** Delete a walk with its sign-ups, votes and route image. */
export async function deleteWalk(walkId: string) {
	const w = await getRow<WalkData>('walks', walkId);
	await deleteWhere('signups', [Query.equal('walk_id', walkId)]);
	await deleteWhere('date_votes', [Query.equal('walk_id', walkId)]);
	await deleteRow('walks', walkId);
	if (w?.route_image_id) await storage.deleteFile({ bucketId: ROUTE_BUCKET, fileId: w.route_image_id }).catch(console.error);
}
