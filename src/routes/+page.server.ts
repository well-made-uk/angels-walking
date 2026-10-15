import { fail } from '@sveltejs/kit';
import { UserError } from '$lib/server/walkers';
import { addSuggestion, deleteOwnSuggestion, joinWalk, leaveWalk, setDateVotes, toggleVote } from '$lib/server/walks-db';
import type { Actions } from './$types';

// Walk details are members-only, so there's nothing to load here: once a
// walker is logged in, the page fetches everything from /api/me.

function text(data: FormData, key: string, max: number) {
	return String(data.get(key) ?? '')
		.trim()
		.slice(0, max);
}

// Every walker action carries the email they logged in with and the token the
// server gave them for passing the log in check. Both are checked on every
// action, and the walker's stored name is used.
function walkerOf(data: FormData) {
	return [text(data, 'walker_email', 254), text(data, 'walker_token', 128)] as const;
}

// Show our own messages; anything unexpected becomes a friendly generic one.
function message(err: unknown) {
	if (err instanceof UserError) return err.message;
	console.error(err);
	return 'Something went wrong - please try again.';
}

export const actions: Actions = {
	join: async ({ request }) => {
		const data = await request.formData();
		const walkId = text(data, 'walk_id', 36);
		try {
			await joinWalk(walkId, ...walkerOf(data));
		} catch (err) {
			return fail(400, { action: 'join', walkId, error: message(err) });
		}
		return { action: 'join', walkId };
	},

	leave: async ({ request }) => {
		const data = await request.formData();
		const walkId = text(data, 'walk_id', 36);
		try {
			await leaveWalk(walkId, ...walkerOf(data));
		} catch (err) {
			return fail(400, { action: 'leave', walkId, error: message(err) });
		}
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

		try {
			await setDateVotes(walkId, dates, ...walkerOf(data));
		} catch (err) {
			return fail(400, { action: 'dates', walkId, error: message(err) });
		}
		return { action: 'dates', walkId, saved: true };
	},

	suggest: async ({ request }) => {
		const data = await request.formData();
		const title = text(data, 'title', 120);
		const details = text(data, 'details', 1000);
		if (!title) {
			return fail(400, { action: 'suggest', error: 'Please say where you would like to walk.', title, details });
		}

		try {
			await addSuggestion(title, details, ...walkerOf(data));
		} catch (err) {
			return fail(400, { action: 'suggest', error: message(err), title, details });
		}
		return { action: 'suggest', success: true };
	},

	vote: async ({ request }) => {
		const data = await request.formData();
		try {
			await toggleVote(text(data, 'suggestion_id', 36), ...walkerOf(data));
		} catch (err) {
			return fail(400, { action: 'vote', error: message(err) });
		}
	},

	removeSuggestion: async ({ request }) => {
		const data = await request.formData();
		try {
			await deleteOwnSuggestion(text(data, 'suggestion_id', 36), ...walkerOf(data));
		} catch (err) {
			return fail(400, { action: 'removeSuggestion', error: message(err) });
		}
	}
};
