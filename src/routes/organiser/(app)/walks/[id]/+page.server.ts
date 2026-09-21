import { error, fail, redirect } from '@sveltejs/kit';
import { requireOrganiser } from '$lib/server/organiser';
import { ROUTE_BUCKET } from '$lib/server/supabase';
import { valuesFromWalk } from '$lib/server/walk-defaults';
import { readWalkForm, saveWalk } from '$lib/server/walk-form';
import { WALK_COLUMNS, type Walk } from '$lib/types';
import { voteDays } from '$lib/walks';
import type { Actions, PageServerLoad } from './$types';

async function getWalk(locals: App.Locals, id: string) {
	const { data, error: err } = await locals.supabase
		.from('angels_walks')
		.select(WALK_COLUMNS)
		.eq('id', id)
		.order('created_at', { referencedTable: 'angels_signups' })
		.maybeSingle();
	if (err) console.error(err);
	if (!data) error(404, 'That walk doesn’t exist (it may have been deleted).');
	return data as unknown as Walk;
}

export const load: PageServerLoad = async ({ locals, params }) => {
	await locals.supabase.rpc('angels_lock_walk', { p_walk_id: params.id });
	const walk = await getWalk(locals, params.id);

	let tally: { date: string; votes: number }[] = [];
	let voters = 0;
	if (!walk.walk_date) {
		const { data } = await locals.supabase.rpc('angels_date_tallies');
		const rows = ((data ?? []) as { walk_id: string; vote_date: string; votes: number; voters: number }[]).filter(
			(r) => r.walk_id === walk.id
		);
		voters = rows[0]?.voters ?? 0;
		tally = voteDays(walk).map((date) => ({
			date,
			votes: rows.find((r) => r.vote_date === date)?.votes ?? 0
		}));
	}

	// Emails are only readable by organisers, via this function.
	const { data: attendees, error: attErr } = await locals.supabase.rpc('angels_walk_attendees', {
		p_walk_id: walk.id
	});
	if (attErr) console.error(attErr);

	return {
		walk,
		attendees: (attendees ?? []) as { id: string; name: string; email: string; created_at: string }[],
		values: valuesFromWalk(walk),
		imageUrl: walk.route_image_path ? (walk.route_image_url ?? null) : null,
		tally,
		voters
	};
};

export const actions: Actions = {
	save: async ({ request, locals, url, params }) => {
		await requireOrganiser(locals, url);
		const existing = await getWalk(locals, params.id);
		const form = readWalkForm(await request.formData());
		if (Object.keys(form.errors).length) {
			return fail(400, { values: form.values, errors: form.errors });
		}
		const result = await saveWalk(locals.supabase, form, existing);
		if ('error' in result) {
			return fail(400, { values: form.values, errors: { [result.field ?? 'form']: result.error } });
		}
		return { saved: true };
	},

	lock: async ({ locals, url, params }) => {
		await requireOrganiser(locals, url);
		const { error: err } = await locals.supabase.rpc('angels_lock_walk', { p_walk_id: params.id, p_force: true });
		if (err) return fail(400, { actionError: err.message });
		return { locked: true };
	},

	removeSignup: async ({ request, locals, url }) => {
		await requireOrganiser(locals, url);
		const id = String((await request.formData()).get('signup_id') ?? '');
		const { error: err } = await locals.supabase.from('angels_signups').delete().eq('id', id);
		if (err) return fail(400, { actionError: 'Could not remove that person.' });
	},

	delete: async ({ locals, url, params }) => {
		await requireOrganiser(locals, url);
		const walk = await getWalk(locals, params.id);
		const { error: err } = await locals.supabase.from('angels_walks').delete().eq('id', params.id);
		if (err) return fail(400, { actionError: 'Could not delete the walk.' });
		if (walk.route_image_path) await locals.supabase.storage.from(ROUTE_BUCKET).remove([walk.route_image_path]);
		redirect(303, '/organiser');
	}
};
