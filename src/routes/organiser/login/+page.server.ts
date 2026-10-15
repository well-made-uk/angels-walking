import { fail, redirect } from '@sveltejs/kit';
import { AppwriteException } from 'node-appwrite';
import { currentOrganiser, sendOrganiserCode, setSession, verifyOrganiserCode } from '$lib/server/organiser';
import type { Actions, PageServerLoad } from './$types';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const safeNext = (next: string | null) =>
	next && next.startsWith('/organiser') && !next.startsWith('//') ? next : '/organiser';

const emailOf = (data: FormData) =>
	String(data.get('email') ?? '')
		.trim()
		.toLowerCase();

export const load: PageServerLoad = async ({ locals, url }) => {
	if (await currentOrganiser(locals)) redirect(303, safeNext(url.searchParams.get('next')));
};

// Organisers sign in with a one-time code emailed to them - no passwords, and
// no sign-ups: only existing accounts labelled as organisers get a code.
export const actions: Actions = {
	sendCode: async ({ request }) => {
		const email = emailOf(await request.formData());
		if (!EMAIL.test(email)) return fail(400, { step: 'email', email, error: 'Please enter your email address.' });

		try {
			// Anyone who isn't an organiser gets the same reply as one who is, so
			// this form can't be used to find out who has an account.
			await sendOrganiserCode(email);
		} catch (error) {
			console.error(error);
			const tooMany = error instanceof AppwriteException && error.code === 429;
			const message = tooMany
				? 'Too many codes requested just now. Please wait a minute and try again.'
				: 'We couldn’t send the email. Please try again shortly.';
			return fail(tooMany ? 429 : 500, { step: 'email', email, error: message });
		}

		return { step: 'code', email };
	},

	verify: async ({ request, cookies, url }) => {
		const data = await request.formData();
		const email = emailOf(data);
		const code = String(data.get('code') ?? '').replace(/\s+/g, '');
		if (!EMAIL.test(email)) return fail(400, { step: 'email', email, error: 'Please enter your email address.' });
		if (!/^\d{6,10}$/.test(code)) {
			return fail(400, { step: 'code', email, error: 'Enter the code from the email - just the numbers.' });
		}

		const secret = await verifyOrganiserCode(email, code);
		if (!secret) {
			return fail(400, { step: 'code', email, error: 'That code didn’t work. It may have expired - codes only last a short while.' });
		}

		setSession(cookies, secret, url.protocol === 'https:');
		redirect(303, safeNext(url.searchParams.get('next')));
	}
};
