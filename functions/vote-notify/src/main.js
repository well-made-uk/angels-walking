// Appwrite Function, run every 30 minutes (cron */30 * * * *). Emails the organisers
// when a date vote opens and when it closes, with a ready-to-paste note for the group.
//
// A vote opens 5 weeks before the earliest day on offer and closes 3 weeks before it
// (see src/lib/walks.ts in the site). The opening time isn't stored, so it is worked
// out here the same way. Once voting closes, the site locks the walk the next time
// anyone opens it, which clears the vote's options and closing time. So while a vote is
// running this function keeps a small "watch" row in the settings table with its closing
// time, and uses that to know when to send the closing email even if the walk has
// already been locked.
//
// Test it by hand with an execution body of:
//   {"dryRun": true, "now": "2026-11-07T00:10:00Z"}   what would be sent at that time
//   {"sample": "open"} or {"sample": "close"}          send a [Test] email now, record nothing
import { createHash } from 'node:crypto';
import { renderClose, renderOpen } from './email.js';
import { addDays, londonToUtc } from './time.js';

const env = (k, d = '') => process.env[k] ?? d;
const DATABASE = env('AW_DATABASE_ID', 'angels_walking');
const ORGANISER_LABEL = 'angelsOrganiser';
const OPEN_DAYS = 35;
const DAY = 24 * 60 * 60 * 1000;
const CATCH_UP = 7 * DAY; // never email about something older than this
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

let apiKey = '';
const api = (path, init = {}) =>
	fetch(env('APPWRITE_FUNCTION_API_ENDPOINT') + path, {
		...init,
		headers: {
			'Content-Type': 'application/json',
			'X-Appwrite-Project': env('APPWRITE_FUNCTION_PROJECT_ID'),
			'X-Appwrite-Key': apiKey
		}
	});
const rowsPath = (table, id = '') => `/tablesdb/${DATABASE}/tables/${table}/rows${id ? `/${id}` : ''}`;
const query = (...qs) => qs.map((q) => `queries[]=${encodeURIComponent(JSON.stringify(q))}`).join('&');

async function listAll(table, extra = []) {
	const out = [];
	let cursor;
	for (;;) {
		const res = await api(
			`${rowsPath(table)}?${query(...extra, { method: 'limit', values: [100] }, ...(cursor ? [{ method: 'cursorAfter', values: [cursor] }] : []))}`
		);
		if (!res.ok) throw new Error(`Appwrite list ${table} failed ${res.status} ${await res.text()}`);
		const { rows } = await res.json();
		out.push(...rows);
		if (rows.length < 100) return out;
		cursor = rows.at(-1).$id;
	}
}

const markerId = (walkId, kind) => createHash('sha256').update(`${walkId}:${kind}`).digest('hex').slice(0, 32);

async function getMarker(walkId, kind) {
	const res = await api(rowsPath('settings', markerId(walkId, kind)));
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`Appwrite get marker failed ${res.status}`);
	return res.json();
}

async function setMarker(walkId, kind, value) {
	const id = markerId(walkId, kind);
	const existing = await getMarker(walkId, kind);
	if (existing) {
		if (existing.value === value) return;
		const res = await api(rowsPath('settings', id), { method: 'PATCH', body: JSON.stringify({ data: { value } }) });
		if (!res.ok) throw new Error(`Appwrite update marker failed ${res.status}`);
		return;
	}
	const res = await api(rowsPath('settings'), {
		method: 'POST',
		body: JSON.stringify({ rowId: id, data: { value } })
	});
	if (!res.ok) throw new Error(`Appwrite create marker failed ${res.status} ${await res.text()}`);
}

async function organisers() {
	const res = await api(`/users?${query({ method: 'limit', values: [100] })}`);
	if (!res.ok) throw new Error(`Appwrite users failed ${res.status}`);
	const { users } = await res.json();
	return users.filter((u) => u.status && u.email && (u.labels ?? []).includes(ORGANISER_LABEL)).map((u) => u.email);
}

/** Most popular day, ties to the earliest; with no votes, the earliest day on offer. */
function tally(votes, options) {
	const counts = new Map();
	for (const v of votes) counts.set(v.vote_date, (counts.get(v.vote_date) ?? 0) + 1);
	const ranking = [...counts].map(([day, n]) => ({ day, votes: n })).sort((a, b) => b.votes - a.votes || a.day.localeCompare(b.day));
	const top = ranking[0];
	return {
		day: top?.day ?? options[0] ?? null,
		votes: top?.votes ?? 0,
		voters: new Set(votes.map((v) => v.walker_email)).size,
		ranking,
		tie: !!top && ranking.filter((r) => r.votes === top.votes).length > 1,
		noVotes: !top
	};
}

async function sendEmail(to, { subject, html, text }) {
	const from = env('RESEND_FROM', 'Angels Walking <awg@well-made.uk>');
	const res = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ from, to: [to], subject, html, text })
	});
	if (!res.ok) throw new Error(`Resend failed ${res.status} ${await res.text()}`);
}

async function run(opt, log) {
	const now = opt.now ? new Date(opt.now) : new Date();
	const site = env('SITE_URL', 'https://awg.well-made.uk').replace(/\/$/, '');
	const dryRun = !!opt.dryRun;
	const to = await organisers();
	const walks = await listAll('walks');
	const planned = [];

	for (const w of walks) {
		if (w.cancelled) continue;
		const options = (w.vote_options ?? []).filter((d) => ISO_DAY.test(d)).sort();
		const voting = !w.walk_date && options.length > 0 && !!w.votes_close_at;

		if (voting) {
			const opensAt = londonToUtc(addDays(options[0], -OPEN_DAYS));
			const closesAt = new Date(w.votes_close_at);
			if (!dryRun && !opt.sample) await setMarker(w.$id, 'watch', closesAt.toISOString());

			// Opened since the organiser made the walk (if it opened the moment they created
			// it, they already know), and still open.
			const cameLater = new Date(w.$createdAt).getTime() < opensAt.getTime();
			const fresh = opensAt <= now && now.getTime() - opensAt.getTime() <= CATCH_UP && closesAt > now;
			if (fresh && cameLater && !(await getMarker(w.$id, 'open'))) planned.push({ kind: 'open', w, options });
		}

		const watch = await getMarker(w.$id, 'watch');
		if (watch) {
			const closedAt = new Date(watch.value);
			const recent = closedAt <= now && now.getTime() - closedAt.getTime() <= CATCH_UP;
			if (recent && !(await getMarker(w.$id, 'close'))) planned.push({ kind: 'close', w, options });
		}
	}

	// A hand-picked sample: use the walk named in the request, else the first one voting.
	if (opt.sample) {
		const pick =
			walks.find((w) => w.$id === opt.walkId) ??
			walks.find((w) => !w.walk_date && (w.vote_options ?? []).length && w.votes_close_at);
		if (!pick) return { error: 'No walk is currently being voted on to use as a sample' };
		const options = [...(pick.vote_options ?? [])].sort();
		const votes = await listAll('date_votes', [{ method: 'equal', attribute: 'walk_id', values: [pick.$id] }]);
		const mail =
			opt.sample === 'open'
				? renderOpen({ walk: { ...pick, vote_options: options }, site, passcode: env('GROUP_PASSCODE'), test: true })
				: renderClose({ walk: pick, result: tally(votes, options), site, test: true });
		for (const addr of to) await sendEmail(addr, mail);
		return { sample: opt.sample, walk: pick.title, sentTo: to.length };
	}

	const summary = [];
	for (const p of planned) {
		const item = { kind: p.kind, walk: p.w.title, to: to.length };
		summary.push(item);
		if (dryRun) continue;
		if (!to.length) {
			log(`No organisers to email for ${p.kind} of ${p.w.title}`);
			continue;
		}
		let mail;
		if (p.kind === 'open') {
			mail = renderOpen({ walk: { ...p.w, vote_options: p.options }, site, passcode: env('GROUP_PASSCODE') });
		} else {
			const votes = await listAll('date_votes', [{ method: 'equal', attribute: 'walk_id', values: [p.w.$id] }]);
			const result = tally(votes, p.options);
			// Already locked by the site: it has the final say on the day.
			if (p.w.walk_date) result.day = p.w.walk_date;
			if (!result.day) {
				log(`Skipping close email for ${p.w.title}: no day to report`);
				continue;
			}
			mail = renderClose({ walk: p.w, result, site });
		}
		for (const addr of to) await sendEmail(addr, mail);
		await setMarker(p.w.$id, p.kind, now.toISOString());
		log(`Sent ${p.kind} email for ${p.w.title} to ${to.length} organiser(s)`);
	}
	return { now: now.toISOString(), dryRun, organisers: to.length, planned: summary };
}

export default async ({ req, res, log, error }) => {
	apiKey = req.headers['x-appwrite-key'] || env('AW_API_KEY');
	const opt = req.bodyJson && typeof req.bodyJson === 'object' ? req.bodyJson : {};
	try {
		return res.json(await run(opt, log));
	} catch (err) {
		error(String(err?.stack || err));
		return res.json({ error: 'failed' }, 500);
	}
};
