import { json } from '@sveltejs/kit';
import { isBot } from '$lib/server/bot-check';
import { supabase } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

/**
 * Walker log in (email + the group passphrase) and sign up (the same, plus a
 * name). There are no passwords: the email is the walker's key. The database
 * checks the passphrase before handing back a walker token. Returns
 * `name: null` from a log in for an email we don't know.
 */
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => ({}));
	if (isBot(body)) return json({ error: 'Something went wrong - please try again.' }, { status: 400 });

	const email = typeof body.email === 'string' ? body.email : '';
	const passphrase = typeof body.passphrase === 'string' ? body.passphrase : '';

	const { data, error } =
		body.action === 'signup'
			? await supabase.rpc('angels_signup_walker', {
					p_email: email,
					p_name: String(body.name ?? ''),
					p_passphrase: passphrase
				})
			: await supabase.rpc('angels_login_walker', { p_email: email, p_answer: passphrase });

	if (error) {
		if (error.code !== 'P0001') console.error(error);
		return json(
			{ error: error.code === 'P0001' ? error.message : 'Something went wrong - please try again.' },
			{ status: 400 }
		);
	}

	const row = ((data ?? []) as { name: string | null; token: string | null }[])[0];
	return json({ name: row?.name ?? null, token: row?.token ?? null });
};
