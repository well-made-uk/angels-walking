// Change this if the group isn't UK-based. Setting it explicitly keeps the
// server-rendered and in-browser times identical.
export const TIME_ZONE = 'Europe/London';

export function walkDate(iso: string) {
	return new Intl.DateTimeFormat('en-GB', {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		timeZone: TIME_ZONE
	}).format(new Date(iso));
}

export function walkTime(iso: string) {
	return new Intl.DateTimeFormat('en-GB', {
		hour: 'numeric',
		minute: '2-digit',
		hour12: true,
		timeZone: TIME_ZONE
	})
		.format(new Date(iso))
		.replace(' ', '');
}

export function duration(mins: number) {
	const h = Math.floor(mins / 60);
	const m = mins % 60;
	if (!h) return `${m} mins`;
	return m ? `${h}h ${m}m` : `${h} hour${h > 1 ? 's' : ''}`;
}

// OpenStreetMap rather than Google Maps: no tracking, no Google.
export function mapLink(place: string) {
	return `https://www.openstreetmap.org/search?query=${encodeURIComponent(place)}`;
}

// Date-only values (YYYY-MM-DD) have no time zone, so format them as UTC.
const dateOnly = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`);

export function dayLabel(d: string, style: 'short' | 'long' = 'short') {
	return new Intl.DateTimeFormat('en-GB', {
		weekday: style === 'short' ? 'short' : 'long',
		day: 'numeric',
		month: style === 'short' ? 'short' : 'long',
		timeZone: 'UTC'
	}).format(dateOnly(d));
}

export function monthLabel(d: string, withYear = false) {
	return new Intl.DateTimeFormat('en-GB', {
		month: 'long',
		...(withYear ? { year: 'numeric' } : {}),
		timeZone: 'UTC'
	}).format(dateOnly(d));
}

/** "10:30" from a Postgres time like "10:30:00", shown as "10:30am". */
export function clockLabel(t: string) {
	const [h, m] = t.split(':').map(Number);
	const suffix = h < 12 ? 'am' : 'pm';
	const h12 = h % 12 || 12;
	return `${h12}:${String(m).padStart(2, '0')}${suffix}`;
}

/** Voting closes at midnight, so describe the last full day people can vote. */
export function votingClosesLabel(closesAt: string) {
	return walkDate(new Date(new Date(closesAt).getTime() - 60_000).toISOString());
}

/** "5 Dec" or "5 Dec – 3 Jan" for a sorted list of days. */
export function dayRangeLabel(days: string[]) {
	if (!days.length) return '';
	const fmt = (d: string) =>
		new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(dateOnly(d));
	const first = days[0];
	const last = days[days.length - 1];
	return first === last ? fmt(first) : `${fmt(first)} – ${fmt(last)}`;
}
