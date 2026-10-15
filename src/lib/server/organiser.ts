import { error, redirect, type Cookies } from '@sveltejs/kit';
import { Query, adminAccount, isNotFound, sessionAccount, users } from '$lib/server/appwrite';

export const SESSION_COOKIE = 'angels_organiser';
/** Appwrite user label that marks an organiser (add it to a user in the Auth console). */
export const ORGANISER_LABEL = 'angelsOrganiser';

const MONTH = 30 * 24 * 60 * 60;

export function setSession(cookies: Cookies, secret: string, secure: boolean) {
	cookies.set(SESSION_COOKIE, secret, { path: '/', httpOnly: true, sameSite: 'lax', secure, maxAge: MONTH });
}

export function clearSession(cookies: Cookies) {
	cookies.delete(SESSION_COOKIE, { path: '/' });
}

/** The organiser account for this email, or null (unknown email, or not an organiser). */
export async function findOrganiser(email: string) {
	const { users: found } = await users.list({ queries: [Query.equal('email', email), Query.limit(1)] });
	const user = found[0];
	return user?.status && user.labels.includes(ORGANISER_LABEL) ? user : null;
}

/** Send a one-time code to an organiser. Returns false (sending nothing) for anyone else, so this can't create accounts. */
export async function sendOrganiserCode(email: string) {
	const user = await findOrganiser(email);
	if (!user) return false;
	await adminAccount.createEmailToken({ userId: user.$id, email });
	return true;
}

/** Swap an emailed code for a session. Returns the session secret, or null if the code is wrong. */
export async function verifyOrganiserCode(email: string, code: string) {
	const user = await findOrganiser(email);
	if (!user) return null;
	try {
		const session = await adminAccount.createSession({ userId: user.$id, secret: code });
		return session.secret;
	} catch {
		return null;
	}
}

const checked = new WeakMap<object, Promise<{ email: string } | null>>();

/** The signed-in organiser for this request, or null. Checked once per request. */
export function currentOrganiser(locals: App.Locals) {
	let result = checked.get(locals);
	if (!result) {
		result = (async () => {
			if (!locals.sessionSecret) return null;
			try {
				const user = await sessionAccount(locals.sessionSecret).get();
				return user.labels.includes(ORGANISER_LABEL) ? { email: user.email } : null;
			} catch (e) {
				if (isNotFound(e) || (e as { code?: number }).code === 401) return null;
				console.error(e);
				error(503, 'Could not check your organiser access. Please try again.');
			}
		})();
		checked.set(locals, result);
	}
	return result;
}

/**
 * Make sure the request comes from a signed-in organiser. Call this from every
 * organiser load *and* form action: layout loads don't protect page loads or
 * actions, which run separately.
 */
export async function requireOrganiser(locals: App.Locals, url: URL) {
	const organiser = await currentOrganiser(locals);
	if (!organiser) redirect(303, `/organiser/login?next=${encodeURIComponent(url.pathname + url.search)}`);
	return organiser;
}
