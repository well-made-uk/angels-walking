import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const safeNext = (next: string | null) =>
	next && next.startsWith('/organiser') && !next.startsWith('//') ? next : '/organiser';

const emailOf = (data: FormData) =>
	String(data.get('email') ?? '')
		.trim()
		.toLowerCase();

export const load: PageServerLoad = async ({ locals, url }) => {
	const {
		data: { user }
	} = await locals.supabase.auth.getUser();
	if (user) redirect(303, safeNext(url.searchParams.get('next')));
};

// Organisers sign in with a one-time code emailed to them - no passwords, and
// no sign-ups: this form can never create an account.
export const actions: Actions = {
	sendCode: async ({ request, locals }) => {
		const email = emailOf(await request.formData());
		if (!EMAIL.test(email)) return fail(400, { step: 'email', email, error: 'Please enter your email address.' });

		const { error } = await locals.supabase.auth.signInWithOtp({
			email,
			options: { shouldCreateUser: false }
		});

		// An email with no account gets the same reply as a real one, so this
		// form can't be used to find out who has an account.
		const noSuchUser = error && (error.code === 'otp_disabled' || error.code === 'user_not_found' || error.status === 422);
		if (error && !noSuchUser) {
			console.error(error);
			const message =
				error.status === 429
					? 'Too many codes requested just now. Please wait a minute and try again.'
					: 'We couldn’t send the email. Please try again shortly.';
			return fail(error.status === 429 ? 429 : 500, { step: 'email', email, error: message });
		}

		return { step: 'code', email };
	},

	verify: async ({ request, locals, url }) => {
		const data = await request.formData();
		const email = emailOf(data);
		const code = String(data.get('code') ?? '').replace(/\s+/g, '');
		if (!EMAIL.test(email)) return fail(400, { step: 'email', email, error: 'Please enter your email address.' });
		if (!/^\d{6,10}$/.test(code)) {
			return fail(400, { step: 'code', email, error: 'Enter the code from the email - just the numbers.' });
		}

		const { error } = await locals.supabase.auth.verifyOtp({ email, token: code, type: 'email' });
		if (error) {
			return fail(400, { step: 'code', email, error: 'That code didn’t work. It may have expired - codes only last a short while.' });
		}

		// Signed in - but only organisers may stay signed in here.
		const { data: isOrganiser } = await locals.supabase.rpc('angels_is_organiser');
		if (!isOrganiser) {
			await locals.supabase.auth.signOut();
			return fail(403, { step: 'email', email, error: 'That account isn’t set up as an organiser.' });
		}

		redirect(303, safeNext(url.searchParams.get('next')));
	}
};
