import type { Handle } from '@sveltejs/kit';
import { createSessionClient } from '$lib/server/supabase';

export const handle: Handle = async ({ event, resolve }) => {
	// Only organisers sign in. Walkers are identified by the name and email
	// their browser sends with each action (see src/lib/walker.svelte.ts).
	if (event.url.pathname.startsWith('/organiser')) {
		event.locals.supabase = createSessionClient(event.cookies);
	}

	return resolve(event, {
		filterSerializedResponseHeaders: (name) => name === 'content-range' || name === 'x-supabase-api-version'
	});
};
