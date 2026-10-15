import { bankHoliday } from '$lib/bank-holidays';

// Walks usually happen every other month. Months are 1-12. (A suggestion for
// the default date range - organisers can pick any days.)
export const WALK_MONTHS = [2, 4, 6, 8, 10, 12];

// A vote runs for the two weeks that sit between these two points, counted back
// from the earliest day on offer: it opens 5 weeks before, and closes 3 weeks
// before (at midnight starting that day). Opening late stops people voting months
// ahead for days they have since made other plans for.
export const VOTE_OPEN_DAYS = 35;
export const VOTE_LEAD_DAYS = 21;

// Longest date range the organiser form offers, and most days in one vote.
export const MAX_RANGE_DAYS = 93;
export const MAX_VOTE_DAYS = 31;

const pad = (n: number) => String(n).padStart(2, '0');
export const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export const parseDay = (s: string) => {
	const [y, m, d] = s.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d));
};

export function addDays(date: string, days: number) {
	const d = parseDay(date);
	d.setUTCDate(d.getUTCDate() + days);
	return iso(d);
}

/** Every day from start to end inclusive (YYYY-MM-DD). */
export function daysBetween(start: string, end: string): string[] {
	const out: string[] = [];
	for (let d = start; d <= end && out.length <= MAX_RANGE_DAYS; d = addDays(d, 1)) out.push(d);
	return out;
}

export const isWeekend = (date: string) => [0, 6].includes(parseDay(date).getUTCDay());

/** The days pre-ticked for a vote: weekends and bank holidays in the range. */
export function defaultVoteDays(start: string, end: string) {
	return daysBetween(start, end).filter((d) => isWeekend(d) || bankHoliday(d));
}

/** Every Saturday and Sunday in the month containing `month` (for older walks). */
export function weekendDates(month: string): string[] {
	const [y, m] = month.split('-').map(Number);
	return daysBetween(iso(new Date(Date.UTC(y, m - 1, 1))), iso(new Date(Date.UTC(y, m, 0)))).filter(isWeekend);
}

/** The days on offer for a walk's vote. */
export const voteDays = (w: { vote_options?: string[] | null; walk_month: string }) =>
	w.vote_options?.length ? w.vote_options : weekendDates(w.walk_month);

/** The last day people can vote when the earliest option is `firstDay`. */
export const lastVotingDay = (firstDay: string) => addDays(firstDay, -VOTE_LEAD_DAYS - 1);

/** The first day people can vote when the earliest option is `firstDay`. */
export const firstVotingDay = (firstDay: string) => addDays(firstDay, -VOTE_OPEN_DAYS);

/** Upcoming walk months (first of month) over the next `count` months. */
export function upcomingWalkMonths(from = new Date(), count = 14): { month: string; votingOpen: boolean }[] {
	const today = iso(from);
	const out: { month: string; votingOpen: boolean }[] = [];
	for (let i = 0; i < count; i++) {
		const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + i, 1));
		if (!WALK_MONTHS.includes(d.getUTCMonth() + 1)) continue;
		const month = iso(d);
		out.push({ month, votingOpen: lastVotingDay(month) >= today });
	}
	return out;
}

/** Last day of the month containing `date`. */
export function monthEnd(date: string) {
	const d = parseDay(date);
	return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}
