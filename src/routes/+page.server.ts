import { fail } from '@sveltejs/kit';
import { supabase } from '$lib/server/supabase';
import type { Actions } from './$types';

// Walk details are members-only, so there's nothing to load here: once a
// walker is logged in, the page fetches everything from /api/me.

function text(data: FormData, key: string, max: number) {
	return String(data.get(key) ?? '')
		.trim()
		.slice(0, max);
}

// Every walker action carries the email they logged in with and the token the
// database gave them for passing the log in check. The database checks both,
// and uses the walker's stored name.
function walkerOf(data: FormData) {
	return { p_email: text(data, 'walker_email', 254), p_token: text(data, 'walker_token', 128) };
}

// Turn database errors raised by our functions into a friendly message.
function message(err: { code?: string; message: string }) {
	return err.code === 'P0001' || err.code === 'P0002'
		? err.message
		: 'Something went wrong - please try again.';
}

export const actions: Actions = {
	join: async ({ request }) => {
		const data = await request.formData();
		const walkId = text(data, 'walk_id', 36);
		const { error: err } = await supabase.rpc('angels_join_walk', {
			p_walk_id: walkId,
			...walkerOf(data)
		});
		if (err) return fail(400, { action: 'join', walkId, error: message(err) });
		return { action: 'join', walkId };
	},

	leave: async ({ request }) => {
		const data = await request.formData();
		const walkId = text(data, 'walk_id', 36);
		const { error: err } = await supabase.rpc('angels_leave_walk', {
			p_walk_id: walkId,
			...walkerOf(data)
		});
		if (err) return fail(400, { action: 'leave', walkId, error: message(err) });
		return { action: 'leave', walkId };
	},

	dates: async ({ request }) => {
		const data = await request.formData();
		const walkId = text(data, 'walk_id', 36);
		const dates = data
			.getAll('dates')
			.map(String)
			.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
			.slice(0, 12);

		const { error: err } = await supabase.rpc('angels_set_date_votes', {
			p_walk_id: walkId,
			p_dates: dates,
			...walkerOf(data)
		});
		if (err) return fail(400, { action: 'dates', walkId, error: message(err) });
		return { action: 'dates', walkId, saved: true };
	},

	suggest: async ({ request }) => {
		const data = await request.formData();
		const title = text(data, 'title', 120);
		const details = text(data, 'details', 1000);
		if (!title) {
			return fail(400, { action: 'suggest', error: 'Please say where you would like to walk.', title, details });
		}

		const { error: err } = await supabase.rpc('angels_add_suggestion', {
			p_title: title,
			p_details: details,
			...walkerOf(data)
		});
		if (err) return fail(400, { action: 'suggest', error: message(err), title, details });
		return { action: 'suggest', success: true };
	},

	vote: async ({ request }) => {
		const data = await request.formData();
		const { error: err } = await supabase.rpc('angels_toggle_vote', {
			p_suggestion_id: text(data, 'suggestion_id', 36),
			...walkerOf(data)
		});
		if (err) return fail(400, { action: 'vote', error: message(err) });
	},

	removeSuggestion: async ({ request }) => {
		const data = await request.formData();
		const { error: err } = await supabase.rpc('angels_delete_suggestion', {
			p_suggestion_id: text(data, 'suggestion_id', 36),
			...walkerOf(data)
		});
		if (err) return fail(400, { action: 'removeSuggestion', error: message(err) });
	}
};
