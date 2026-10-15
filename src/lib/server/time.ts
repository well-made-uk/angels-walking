// Walk times are UK time (see TIME_ZONE in src/lib/format.ts).
const parts = new Intl.DateTimeFormat('en-GB', {
	timeZone: 'Europe/London',
	hourCycle: 'h23',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit'
});

/** How far London is ahead of UTC at this instant, in ms (1 hour in summer). */
function londonOffset(at: number) {
	const p = Object.fromEntries(parts.formatToParts(new Date(at)).map((x) => [x.type, Number(x.value)]));
	return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(at / 1000) * 1000;
}

/** The instant that is `date` (YYYY-MM-DD) at `time` (HH:MM) on a London clock. */
export function londonToUtc(date: string, time = '00:00') {
	const [y, m, d] = date.split('-').map(Number);
	const [hh, mm] = time.split(':').map(Number);
	const naive = Date.UTC(y, m - 1, d, hh, mm);
	// Two passes so the answer is right either side of a clock change.
	const guess = naive - londonOffset(naive);
	return new Date(naive - londonOffset(guess));
}
