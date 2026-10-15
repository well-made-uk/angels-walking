import { json } from '@sveltejs/kit';
import { isBot } from '$lib/server/bot-check';
import { UserError, loginWalker, signupWalker } from '$lib/server/walkers';
import type { RequestHandler } from './$types';

/**
 * Walker log in (email + the group passphrase) and sign up (the same, plus a
 * name). There are no passwords: the email is the walker's key. The server
 * checks the passphrase before handing back a walker token. Returns
 * `name: null` from a log in for an email we don't know.
 */
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => ({}));
	if (isBot(body)) return json({ error: 'Something went wrong - please try again.' }, { status: 400 });

	try {
		const result =
			body.action === 'signup'
				? await signupWalker(body.email, body.name, body.passphrase)
				: await loginWalker(body.email, body.passphrase);
		return json({ name: result.name, token: result.token });
	} catch (err) {
		if (err instanceof UserError) return json({ error: err.message }, { status: 400 });
		console.error(err);
		return json({ error: 'Something went wrong - please try again.' }, { status: 400 });
	}
};
