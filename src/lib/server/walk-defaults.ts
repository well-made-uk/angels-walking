import type { SupabaseClient } from '@supabase/supabase-js';
import type { Walk, WalkFormValues } from '$lib/types';
import { defaultVoteDays, monthEnd, upcomingWalkMonths, voteDays } from '$lib/walks';

/** Upcoming walk months, noting which already have a (non-cancelled) walk. */
export async function walkMonthOptions(supabase: SupabaseClient, ignoreWalkId?: string) {
	const months = upcomingWalkMonths();
	const { data } = await supabase
		.from('angels_walks')
		.select('id, walk_month')
		.eq('cancelled', false)
		.gte('walk_month', months[0]?.month ?? '1970-01-01');
	const taken = new Set((data ?? []).filter((w) => w.id !== ignoreWalkId).map((w) => w.walk_month));
	return months.map((m) => ({ ...m, taken: taken.has(m.month) }));
}

export function emptyValues(): WalkFormValues {
	return {
		title: '',
		description: '',
		meeting_point: '',
		distance_km: '',
		duration_hours: '',
		duration_minutes: '0',
		difficulty: '',
		max_people: '',
		notes: '',
		start_time: '10:00',
		date_mode: 'vote',
		range_start: '',
		range_end: '',
		vote_options: [],
		vote_deadline: '',
		walk_date: '',
		suggestion_id: '',
		cancelled: false,
		remove_image: false
	};
}

export function valuesFromWalk(w: Walk): WalkFormValues {
	const mins = w.duration_mins ?? 0;
	return {
		title: w.title,
		description: w.description ?? '',
		meeting_point: w.meeting_point,
		distance_km: w.distance_km == null ? '' : String(Number(w.distance_km)),
		duration_hours: mins ? String(Math.floor(mins / 60)) : '',
		duration_minutes: String(Math.round((mins % 60) / 15) * 15 % 60),
		difficulty: w.difficulty ?? '',
		max_people: w.max_people == null ? '' : String(w.max_people),
		notes: w.notes ?? '',
		start_time: w.start_time.slice(0, 5),
		date_mode: w.walk_date ? 'fixed' : 'vote',
		...(() => {
			const days = voteDays(w);
			return { range_start: days[0], range_end: days[days.length - 1], vote_options: days };
		})(),
		vote_deadline: w.vote_deadline ?? '',
		walk_date: w.walk_date ?? '',
		suggestion_id: w.suggestion_id ?? '',
		cancelled: w.cancelled,
		remove_image: false
	};
}

/**
 * A sensible starting range for a new vote: the next walk month (Feb, Apr,
 * ...) that doesn't have a walk yet and is still far enough away to vote on,
 * with its weekends and bank holidays ticked.
 */
export function suggestedVote(months: { month: string; votingOpen: boolean; taken: boolean }[]) {
	const month = (months.find((m) => m.votingOpen && !m.taken) ?? months.find((m) => m.votingOpen))?.month;
	if (!month) return { range_start: '', range_end: '', vote_options: [] as string[] };
	const range_end = monthEnd(month);
	return { range_start: month, range_end, vote_options: defaultVoteDays(month, range_end) };
}
