import { json } from '@sveltejs/kit';
import { emptyActivity } from '$lib/activity';
import { normEmail, whoami } from '$lib/server/walkers';
import { myActivity, walkerFeed } from '$lib/server/walks-db';
import type { RequestHandler } from './$types';

// Everything personal to a logged-in walker: the walks and ideas they can see
// (walk details are members-only), plus what they've joined, hearted,
// suggested and voted for. The server checks their token for all of it.
export const POST: RequestHandler = async ({ request }) => {
	const { email, token } = await request.json().catch(() => ({}));
	const mine = emptyActivity();
	if (typeof email !== 'string' || typeof token !== 'string' || !email || !token) return json(mine);

	try {
		// A bad token (or a removed walker) means they're treated as logged out.
		mine.name = await whoami(email, token);
		mine.known = mine.name !== null;
		if (!mine.known) return json(mine);

		const [activity, feed] = await Promise.all([myActivity(normEmail(email)), walkerFeed()]);
		for (const r of activity) {
			if (r.kind === 'walk') mine.joined.push(r.ref_id);
			else if (r.kind === 'vote') mine.voted.push(r.ref_id);
			else if (r.kind === 'suggestion') mine.suggested.push(r.ref_id);
			else if (r.kind === 'date' && r.vote_date) (mine.dates[r.ref_id] ??= []).push(r.vote_date);
		}
		mine.feed = feed;
		return json(mine);
	} catch (err) {
		console.error(err);
		return json(emptyActivity(), { status: 503 });
	}
};
