import { error, fail, redirect } from '@sveltejs/kit';
import { requireOrganiser } from '$lib/server/organiser';
import { deleteRow } from '$lib/server/appwrite';
import { valuesFromWalk } from '$lib/server/walk-defaults';
import { readWalkForm, saveWalk } from '$lib/server/walk-form';
import { UserError } from '$lib/server/walkers';
import { attendees, dateTallies, deleteWalk, loadWalk, lockWalk } from '$lib/server/walks-db';
import { voteDays } from '$lib/walks';
import type { Actions, PageServerLoad } from './$types';

async function getWalk(id: string) {
	const walk = await loadWalk(id);
	if (!walk) error(404, 'That walk doesn’t exist (it may have been deleted).');
	return walk;
}

export const load: PageServerLoad = async ({ locals, url, params }) => {
	await requireOrganiser(locals, url);
	await lockWalk(params.id);
	const walk = await getWalk(params.id);

	let tally: { date: string; votes: number }[] = [];
	let voters = 0;
	if (!walk.walk_date) {
		const counts = await dateTallies(walk.id);
		voters = counts.voters;
		tally = voteDays(walk).map((date) => ({ date, votes: counts.counts.get(date) ?? 0 }));
	}

	return {
		walk,
		// Emails are only ever read here, behind the organiser check above.
		attendees: await attendees(walk.id),
		values: valuesFromWalk(walk),
		imageUrl: walk.route_image_url,
		tally,
		voters
	};
};

export const actions: Actions = {
	save: async ({ request, locals, url, params }) => {
		await requireOrganiser(locals, url);
		const existing = await getWalk(params.id);
		const form = readWalkForm(await request.formData());
		if (Object.keys(form.errors).length) {
			return fail(400, { values: form.values, errors: form.errors });
		}
		const result = await saveWalk(form, existing);
		if ('error' in result) {
			return fail(400, { values: form.values, errors: { [result.field ?? 'form']: result.error } });
		}
		return { saved: true };
	},

	lock: async ({ locals, url, params }) => {
		await requireOrganiser(locals, url);
		try {
			await lockWalk(params.id, { force: true });
		} catch (err) {
			console.error(err);
			return fail(400, { actionError: err instanceof UserError ? err.message : 'Could not lock in the date.' });
		}
		return { locked: true };
	},

	removeSignup: async ({ request, locals, url }) => {
		await requireOrganiser(locals, url);
		const id = String((await request.formData()).get('signup_id') ?? '');
		try {
			await deleteRow('signups', id);
		} catch (err) {
			console.error(err);
			return fail(400, { actionError: 'Could not remove that person.' });
		}
	},

	delete: async ({ locals, url, params }) => {
		await requireOrganiser(locals, url);
		await getWalk(params.id);
		try {
			await deleteWalk(params.id);
		} catch (err) {
			console.error(err);
			return fail(400, { actionError: 'Could not delete the walk.' });
		}
		redirect(303, '/organiser');
	}
};
