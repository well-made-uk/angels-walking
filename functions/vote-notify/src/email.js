// The two organiser emails, in the Angels Walking site's greens. Table layout and
// inline styles because that's what email clients support.
const C = {
	accent: '#1d5b43',
	accentSoft: '#e3f1e9',
	ink: '#153d2e',
	muted: '#5b7a6d',
	page: '#f4f9f6',
	card: '#ffffff',
	border: '#d9eae1',
	trail: '#e8590c',
	trailSoft: '#fdede3'
};
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const dayLong = (d) =>
	new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
		new Date(`${d}T00:00:00Z`)
	);
const dayShort = (d) =>
	new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
		new Date(`${d}T00:00:00Z`)
	);
/** Voting closes at midnight, so name the last full day people could vote. */
const closesLabel = (closesAt) =>
	new Intl.DateTimeFormat('en-GB', {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		timeZone: 'Europe/London'
	}).format(new Date(new Date(closesAt).getTime() - 60_000));

function shell({ title, preheader, heading, body, test }) {
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>@media (max-width:620px){.container{width:100% !important}.pad{padding-left:14px !important;padding-right:14px !important}}</style>
</head>
<body style="margin:0;padding:0;background:${C.page}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page}"><tr><td align="center" class="pad" style="padding:28px 16px">
<table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%">
  <tr><td style="padding:0 4px 16px;font:700 13px/1 ${FONT};color:${C.accent};text-transform:uppercase;letter-spacing:0.08em">Angels Walking Group${test ? ` <span style="background:${C.trailSoft};color:${C.trail};border-radius:999px;padding:3px 9px;margin-left:6px">Test</span>` : ''}</td></tr>
  <tr><td style="padding:0 4px 18px;font:700 25px/1.25 ${FONT};color:${C.ink}">${heading}</td></tr>
  <tr><td>${body}</td></tr>
  <tr><td style="padding:14px 4px 0;font:12px/1.6 ${FONT};color:${C.muted}">You're getting this because you're an organiser. It's sent automatically when a vote opens and when it closes.</td></tr>
</table></td></tr></table></body></html>`;
}

const card = (inner, accent = C.accent) =>
	`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px;background:${C.card};border:1px solid ${C.border};border-left:4px solid ${accent};border-radius:12px"><tr><td style="padding:16px 18px;font:15px/1.55 ${FONT};color:${C.ink}">${inner}</td></tr></table>`;

const label = (t) =>
	`<div style="font:700 11px/1 ${FONT};color:${C.muted};text-transform:uppercase;letter-spacing:0.08em;margin:0 0 8px">${esc(t)}</div>`;

const button = (href, text) =>
	`<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 0"><tr><td style="border-radius:8px;background:${C.accent}"><a href="${esc(href)}" style="display:inline-block;padding:11px 20px;border-radius:8px;background:${C.accent};color:#ffffff;font:600 15px/20px ${FONT};text-decoration:none">${esc(text)}</a></td></tr></table>`;

/** A quiet link to the page that makes the walk's share image (organisers sign in there). */
const imageLink = (site, walk) =>
	`<div style="margin:14px 0 0;font:14px/1.5 ${FONT};color:${C.muted}">Want a picture for the chat? <a href="${esc(imageUrl(site, walk))}" style="color:${C.accent};font-weight:600">Make a share image</a></div>`;
const imageUrl = (site, walk) => `${site}/organiser/walks/${walk.$id}/image`;

/** The ready-to-paste note for the group chat. */
const groupNote = (text) =>
	`<div style="background:${C.accentSoft};border-radius:10px;padding:14px 16px;font:15px/1.55 ${FONT};color:${C.ink};white-space:pre-wrap">${esc(text)}</div>
	 <div style="margin-top:6px;font:12px/1.4 ${FONT};color:${C.muted}">Copy this into the group chat.</div>`;

/** Voting has just opened. */
export function renderOpen({ walk, site, passcode = '', test = false }) {
	const days = [...walk.vote_options].sort();
	const closes = closesLabel(walk.votes_close_at);
	// *like this* is bold in WhatsApp. The passcode comes from the function's GROUP_PASSCODE
	// variable, not this file, because the repo is public.
	const note = [
		'Voting is open for the next walk!',
		`*${walk.title}*`,
		`The walk will be between *${dayLong(days[0])}* and *${dayLong(days.at(-1))}*.`,
		`Let us know which dates are available here: ${site}`,
		passcode ? `Passcode: ${passcode}` : null,
		`Voting deadline: *${closes}*`
	]
		.filter(Boolean)
		.join('\n');
	const chips = days
		.map(
			(d) =>
				`<span style="display:inline-block;margin:0 6px 6px 0;padding:4px 10px;border-radius:999px;background:${C.accentSoft};font:600 13px/18px ${FONT};color:${C.ink}">${esc(dayShort(d))}</span>`
		)
		.join('');
	const html = shell({
		test,
		title: `Voting is open: ${walk.title}`,
		preheader: `Closes at the end of ${closes}. Tell the group.`,
		heading: `Voting is open for ${esc(walk.title)}`,
		body:
			card(`${label('Days on offer')}${chips}<div style="margin-top:6px;color:${C.muted};font-size:14px">Voting closes at the end of <strong style="color:${C.ink}">${esc(closes)}</strong>.</div>`) +
			card(`${label('Message for the group')}${groupNote(note)}`, C.trail) +
			button(site, 'Open the site') +
			imageLink(site, walk)
	});
	const text = `Voting is open for ${walk.title}\n\nDays on offer: ${days.map(dayShort).join(', ')}\nVoting closes at the end of ${closes}.\n\nMessage for the group:\n${note}\n\n${site}\n\nShare image for the chat: ${imageUrl(site, walk)}`;
	return { subject: `${test ? '[Test] ' : ''}Voting is open: ${walk.title}`, html, text };
}

/** Voting has just closed; `result` is {day, votes, voters, ranking, tie, noVotes}. */
export function renderClose({ walk, result, site, test = false }) {
	const when = walk.start_time ? ` at ${walk.start_time}` : '';
	const where = walk.meeting_point ? `, meeting at ${walk.meeting_point}` : '';
	const note = `${walk.title} is on for ${dayLong(result.day)}${when}${where}.\nSign up here: ${site}`;
	const rows = result.ranking
		.slice(0, 5)
		.map(
			(r) =>
				`<tr><td style="padding:3px 0;font:${r.day === result.day ? '700' : '400'} 15px/1.4 ${FONT};color:${C.ink}">${esc(dayShort(r.day))}</td><td align="right" style="padding:3px 0;font:${r.day === result.day ? '700' : '400'} 15px/1.4 ${FONT};color:${C.ink}">${r.votes}</td></tr>`
		)
		.join('');
	const summary = result.noVotes
		? 'Nobody voted, so the earliest day on offer is used.'
		: `${result.voters} ${result.voters === 1 ? 'person' : 'people'} voted.${result.tie ? ' Two or more days tied, so the earliest of them wins.' : ''}`;
	const html = shell({
		test,
		title: `Voting closed: ${walk.title}`,
		preheader: `${dayLong(result.day)} won. Tell the group.`,
		heading: `Voting has closed for ${esc(walk.title)}`,
		body:
			card(
				`${label('The day')}<div style="font:700 22px/1.3 ${FONT};color:${C.accent}">${esc(dayLong(result.day))}</div><div style="margin-top:4px;color:${C.muted};font-size:14px">${esc(summary)}</div>` +
					(result.noVotes ? '' : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;border-top:1px solid ${C.border}">${rows}</table>`)
			) +
			card(`${label('Message for the group')}${groupNote(note)}`, C.trail) +
			button(site, 'Open the site') +
			imageLink(site, walk) +
			`<div style="margin:14px 0 0;font:13px/1.5 ${FONT};color:${C.muted}">The walk shows this date as soon as anyone next opens the site.</div>`
	});
	const text = `Voting has closed for ${walk.title}\n\nThe day: ${dayLong(result.day)}\n${summary}\n\nMessage for the group:\n${note}\n\n${site}\n\nShare image for the chat: ${imageUrl(site, walk)}`;
	return { subject: `${test ? '[Test] ' : ''}Voting closed: ${walk.title} is on ${dayShort(result.day)}`, html, text };
}
