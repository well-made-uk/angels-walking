import { json } from '@sveltejs/kit';
import { emptyActivity } from '$lib/activity';
import { supabase } from '$lib/server/supabase';
import type { Feed } from '$lib/types';
import type { RequestHandler } from './$types';

// Everything personal to a logged-in walker: the walks and ideas they can see
// (walk details are members-only), plus what they've joined, hearted,
// suggested and voted for. The database checks their token for all of it.
export const POST: RequestHandler = async ({ request }) => {
	const { email, token } = await request.json().catch(() => ({}));
	const mine = emptyActivity();
	if (typeof email !== 'string' || typeof token !== 'string' || !email || !token) return json(mine);

	// A bad token (or a removed walker) means they're treated as logged out.
	const who = await supabase.rpc('angels_whoami', { p_email: email, p_token: token });
	if (who.error) {
		console.error(who.error);
		return json(mine, { status: 503 });
	}
	mine.name = (who.data as string | null) ?? null;
	mine.known = mine.name !== null;
	if (!mine.known) return json(mine);

	const [activity, feed] = await Promise.all([
		supabase.rpc('angels_my_activity', { p_email: email, p_token: token }),
		supabase.rpc('angels_walker_feed', { p_email: email, p_token: token })
	]);
	for (const res of [activity, feed]) {
		if (res.error) {
			console.error(res.error);
			return json(mine, { status: res.error.code === 'P0001' ? 400 : 503 });
		}
	}

	for (const r of (activity.data ?? []) as { kind: string; ref_id: string; vote_date: string | null }[]) {
		if (r.kind === 'walk') mine.joined.push(r.ref_id);
		else if (r.kind === 'vote') mine.voted.push(r.ref_id);
		else if (r.kind === 'suggestion') mine.suggested.push(r.ref_id);
		else if (r.kind === 'date' && r.vote_date) (mine.dates[r.ref_id] ??= []).push(r.vote_date);
	}
	mine.feed = feed.data as Feed;
	return json(mine);
};
