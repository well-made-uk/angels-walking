import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { createRow, getRow, isConflict, updateRow } from '$lib/server/appwrite';

/** A problem we can safely show to the walker (anything else becomes a generic message). */
export class UserError extends Error {}

interface WalkerRow {
	email: string;
	name: string;
	last_seen_at: string;
}

// The passphrase and token secret live in the `settings` table, which only the
// server's API key can read. Cached briefly so a changed passphrase applies
// within a minute without a redeploy.
const cache = new Map<string, { value: string; at: number }>();
async function setting(key: string) {
	const hit = cache.get(key);
	if (hit && Date.now() - hit.at < 60_000) return hit.value;
	const row = await getRow<{ value: string }>('settings', key);
	if (!row) throw new Error(`Missing setting "${key}" in the settings table`);
	cache.set(key, { value: row.value, at: Date.now() });
	return row.value;
}

function safeEqual(a: string, b: string) {
	const x = Buffer.from(a);
	const y = Buffer.from(b);
	return x.length === y.length && timingSafeEqual(x, y);
}

export function normEmail(raw: unknown) {
	const e = String(raw ?? '')
		.trim()
		.toLowerCase();
	if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) || e.length > 254) {
		throw new UserError('Please enter a valid email address');
	}
	return e;
}

/** Walker row ids: a stable hash of the email, so an email can only have one record. */
export const walkerId = (email: string) => createHash('sha256').update(email).digest('hex').slice(0, 32);

async function tokenFor(email: string) {
	return createHmac('sha256', await setting('token_secret')).update(email).digest('hex');
}

export async function checkPassphrase(given: unknown) {
	// Capitals, spaces and punctuation are ignored.
	const clean = String(given ?? '')
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]/gu, '');
	const want = String(await setting('signup_passphrase'));
	if (!safeEqual(clean, want)) {
		throw new UserError("That passphrase isn't right - it's in the WhatsApp group description, or ask the organiser.");
	}
}

/** Check the walker's token and return their stored record. */
export async function requireWalker(rawEmail: unknown, token: unknown) {
	const email = normEmail(rawEmail);
	const want = await tokenFor(email);
	if (!safeEqual(String(token ?? ''), want)) {
		throw new UserError('Please log in or sign up first');
	}
	const walker = await getRow<WalkerRow>('walkers', walkerId(email));
	if (!walker) throw new UserError('Please log in or sign up first');
	updateRow('walkers', walker.$id, { last_seen_at: new Date().toISOString() }).catch(console.error);
	return { email, name: walker.name };
}

/** Returns the walker's name, or null for a bad token or a removed walker. */
export async function whoami(email: unknown, token: unknown) {
	try {
		return (await requireWalker(email, token)).name;
	} catch (e) {
		if (e instanceof UserError) return null;
		throw e;
	}
}

export async function loginWalker(rawEmail: unknown, passphrase: unknown) {
	await checkPassphrase(passphrase);
	const email = normEmail(rawEmail);
	const walker = await getRow<WalkerRow>('walkers', walkerId(email));
	if (!walker) return { name: null, token: null };
	updateRow('walkers', walker.$id, { last_seen_at: new Date().toISOString() }).catch(console.error);
	return { name: walker.name, token: await tokenFor(email) };
}

export async function signupWalker(rawEmail: unknown, rawName: unknown, passphrase: unknown) {
	await checkPassphrase(passphrase);
	const email = normEmail(rawEmail);
	const name = String(rawName ?? '').trim();
	if (!name) throw new UserError('Please tell us your name');
	if ([...name].length > 60) throw new UserError('That name is a bit long - 60 characters at most');

	const now = new Date().toISOString();
	let stored = name;
	try {
		await createRow('walkers', walkerId(email), { email, name, last_seen_at: now });
	} catch (e) {
		if (!isConflict(e)) throw e;
		// Already a walker: signing up again just logs them in, keeping their name.
		const existing = await getRow<WalkerRow>('walkers', walkerId(email));
		stored = existing?.name ?? name;
		await updateRow('walkers', walkerId(email), { last_seen_at: now });
	}
	return { name: stored, token: await tokenFor(email) };
}
