import { fail } from '@sveltejs/kit';
import { requireOrganiser } from '$lib/server/organiser';
import type { OrganiserSuggestion, Suggestion } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

interface WalkRow {
	id: string;
	title: string;
	starts_at: string | null;
	walk_date: string | null;
	walk_month: string;
	vote_options: string[] | null;
	votes_close_at: string | null;
	cancelled: boolean;
	max_people: number | null;
	signups: { id: string }[];
}

export const load: PageServerLoad = async ({ locals }) => {
	await locals.supabase.rpc('angels_lock_due_walks');

	const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
	const [walks, past, suggestions, authors] = await Promise.all([
		locals.supabase
			.from('angels_walks')
			.select('id, title, starts_at, walk_date, walk_month, vote_options, votes_close_at, cancelled, max_people, signups:angels_signups(id)')
			.or(`starts_at.gte.${since},walk_date.is.null`)
			.order('walk_month')
			.order('starts_at'),
		locals.supabase
			.from('angels_walks')
			.select('id, title, starts_at, walk_date, walk_month, vote_options, votes_close_at, cancelled, max_people, signups:angels_signups(id)')
			.lt('starts_at', since)
			.order('starts_at', { ascending: false })
			.limit(6),
		locals.supabase
			.from('angels_suggestions_ranked')
			.select('*')
			.order('promoted')
			.order('votes', { ascending: false })
			.order('created_at', { ascending: false }),
		locals.supabase.from('angels_suggestions').select('id, suggested_by')
	]);

	for (const res of [walks, past, suggestions, authors]) if (res.error) console.error(res.error);
	const authorOf = new Map((authors.data ?? []).map((a) => [a.id as string, a.suggested_by as string | null]));

	return {
		// Shown on the page, so a failed load isn't mistaken for "no walks".
		loadError: walks.error || past.error || suggestions.error ? true : false,
		walks: (walks.data ?? []) as WalkRow[],
		past: (past.data ?? []) as WalkRow[],
		suggestions: ((suggestions.data ?? []) as Suggestion[]).map(
			(s): OrganiserSuggestion => ({ ...s, suggested_by: authorOf.get(s.id) ?? null })
		)
	};
};

export const actions: Actions = {
	removeSuggestion: async ({ request, locals, url }) => {
		await requireOrganiser(locals, url);
		const id = String((await request.formData()).get('suggestion_id') ?? '');
		const { error } = await locals.supabase.from('angels_suggestions').delete().eq('id', id);
		if (error) return fail(400, { error: 'Could not remove that suggestion.' });
	}
};
