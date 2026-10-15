import { fail } from '@sveltejs/kit';
import { requireOrganiser } from '$lib/server/organiser';
import { dashboardWalks, removeSuggestion, suggestionsView } from '$lib/server/walks-db';
import type { OrganiserSuggestion } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	await requireOrganiser(locals, url);

	try {
		const [{ walks, past }, ideas] = await Promise.all([dashboardWalks(), suggestionsView()]);
		return {
			loadError: false,
			walks,
			past,
			suggestions: ideas
				.sort((a, b) => Number(a.promoted) - Number(b.promoted) || b.votes - a.votes || b.created_at.localeCompare(a.created_at))
				.map(({ walker_email: _email, ...s }): OrganiserSuggestion => s)
		};
	} catch (err) {
		console.error(err);
		// Shown on the page, so a failed load isn't mistaken for "no walks".
		return { loadError: true, walks: [], past: [], suggestions: [] as OrganiserSuggestion[] };
	}
};

export const actions: Actions = {
	removeSuggestion: async ({ request, locals, url }) => {
		await requireOrganiser(locals, url);
		const id = String((await request.formData()).get('suggestion_id') ?? '');
		try {
			await removeSuggestion(id);
		} catch (err) {
			console.error(err);
			return fail(400, { error: 'Could not remove that suggestion.' });
		}
	}
};
