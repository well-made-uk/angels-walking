import { requireOrganiser } from '$lib/server/organiser';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	const user = await requireOrganiser(locals, url);
	return { email: user.email };
};
