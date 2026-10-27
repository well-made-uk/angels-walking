import { error } from '@sveltejs/kit';
import { requireOrganiser } from '$lib/server/organiser';
import { loadWalk } from '$lib/server/walks-db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url, params }) => {
	await requireOrganiser(locals, url);
	const walk = await loadWalk(params.id);
	if (!walk) error(404, 'That walk doesn’t exist (it may have been deleted).');
	return { walkId: walk.id, title: walk.title };
};
