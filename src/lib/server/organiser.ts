import { error, redirect } from '@sveltejs/kit';

/**
 * Make sure the request comes from a signed-in organiser. Call this from every
 * organiser load *and* form action: layout loads don't protect actions.
 */
export async function requireOrganiser(locals: App.Locals, url: URL) {
	const {
		data: { user }
	} = await locals.supabase.auth.getUser();
	if (!user) {
		redirect(303, `/organiser/login?next=${encodeURIComponent(url.pathname + url.search)}`);
	}

	const { data: isOrganiser, error: err } = await locals.supabase.rpc('angels_is_organiser');
	if (err) {
		console.error(err);
		error(503, 'Could not check your organiser access. Please try again.');
	}
	if (!isOrganiser) {
		error(403, `${user.email} isn't set up as an Angels Walking Group organiser.`);
	}
	return user;
}
