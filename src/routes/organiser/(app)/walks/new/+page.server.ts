import { fail, redirect } from '@sveltejs/kit';
import { requireOrganiser } from '$lib/server/organiser';
import { emptyValues, suggestedVote, walkMonthOptions } from '$lib/server/walk-defaults';
import { readWalkForm, saveWalk } from '$lib/server/walk-form';
import type { OrganiserSuggestion } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const months = await walkMonthOptions(locals.supabase);
	const values = { ...emptyValues(), ...suggestedVote(months) };

	let suggestion: OrganiserSuggestion | null = null;
	const suggestionId = url.searchParams.get('suggestion');
	if (suggestionId) {
		const [ranked, author] = await Promise.all([
			locals.supabase.from('angels_suggestions_ranked').select('*').eq('id', suggestionId).maybeSingle(),
			locals.supabase.from('angels_suggestions').select('suggested_by').eq('id', suggestionId).maybeSingle()
		]);
		suggestion = ranked.data ? { ...ranked.data, suggested_by: author.data?.suggested_by ?? null } : null;
		if (suggestion) {
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

		const result = await saveWalk(locals.supabase, form, null);
		if ('error' in result) {
			return fail(400, { values: form.values, errors: { [result.field ?? 'form']: result.error } });
		}
		redirect(303, `/organiser/walks/${result.id}?created=1`);
	}
};
