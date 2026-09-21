import { requireOrganiser } from '$lib/server/organiser';
import { refreshRouteImageLinks } from '$lib/server/route-images';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	const user = await requireOrganiser(locals, url);
	await refreshRouteImageLinks(locals.supabase);
	return { email: user.email ?? '' };
};
