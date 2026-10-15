import type { Handle } from '@sveltejs/kit';
import { SESSION_COOKIE } from '$lib/server/organiser';

export const handle: Handle = async ({ event, resolve }) => {
	// Only organisers sign in. Walkers are identified by the email and token
	// their browser sends with each action (see src/lib/walker.svelte.ts).
	event.locals.sessionSecret = event.url.pathname.startsWith('/organiser')
		? (event.cookies.get(SESSION_COOKIE) ?? null)
		: null;

	return resolve(event);
};
