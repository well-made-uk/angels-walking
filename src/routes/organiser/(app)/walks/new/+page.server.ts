import { fail, redirect } from '@sveltejs/kit';
import { requireOrganiser } from '$lib/server/organiser';
import { emptyValues, suggestedVote, walkMonthOptions } from '$lib/server/walk-defaults';
import { readWalkForm, saveWalk } from '$lib/server/walk-form';
import { suggestionsView } from '$lib/server/walks-db';
import type { OrganiserSuggestion } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	await requireOrganiser(locals, url);
	const months = await walkMonthOptions();
	const values = { ...emptyValues(), ...suggestedVote(months) };

	let suggestion: OrganiserSuggestion | null = null;
	const suggestionId = url.searchParams.get('suggestion');
	if (suggestionId) {
		const found = (await suggestionsView()).find((s) => s.id === suggestionId);
		if (found) {
			const { walker_email: _email, ...rest } = found;
			suggestion = rest;
			values.title = suggestion.title;
			values.description = suggestion.details ?? '';
			values.suggestion_id = suggestion.id;
		}
	}

	return { values, suggestion };
};

export const actions: Actions = {
	save: async ({ request, locals, url }) => {
		await requireOrganiser(locals, url);
		const form = readWalkForm(await request.formData());
		if (Object.keys(form.errors).length) {
			return fail(400, { values: form.values, errors: form.errors });
		}

		const result = await saveWalk(form, null);
		if ('error' in result) {
			return fail(400, { values: form.values, errors: { [result.field ?? 'form']: result.error } });
		}
		redirect(303, `/organiser/walks/${result.id}?created=1`);
	}
};
