// Walk times are UK time. Same maths as src/lib/server/time.ts in the site (a function
// deploys on its own, so it can't import from there).
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

function londonOffset(at) {
	const p = Object.fromEntries(parts.formatToParts(new Date(at)).map((x) => [x.type, Number(x.value)]));
	return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(at / 1000) * 1000;
}

/** The instant that is `date` (YYYY-MM-DD) at `time` (HH:MM) on a London clock. */
export function londonToUtc(date, time = '00:00') {
	const [y, m, d] = date.split('-').map(Number);
	const [hh, mm] = time.split(':').map(Number);
	const naive = Date.UTC(y, m - 1, d, hh, mm);
	const guess = naive - londonOffset(naive);
	return new Date(naive - londonOffset(guess));
}

export function addDays(date, days) {
	const [y, m, d] = date.split('-').map(Number);
	const t = new Date(Date.UTC(y, m - 1, d));
	t.setUTCDate(t.getUTCDate() + days);
	return t.toISOString().slice(0, 10);
}
