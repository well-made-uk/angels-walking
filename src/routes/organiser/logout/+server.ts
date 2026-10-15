import { redirect } from '@sveltejs/kit';
import { clearSession } from '$lib/server/organiser';
import { sessionAccount } from '$lib/server/appwrite';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, cookies }) => {
	if (locals.sessionSecret) {
		await sessionAccount(locals.sessionSecret)
			.deleteSession({ sessionId: 'current' })
			.catch(() => {});
	}
	clearSession(cookies);
	redirect(303, '/organiser/login');
};
