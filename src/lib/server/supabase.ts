import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import type { Cookies } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

const url = env.SUPABASE_URL;
const key = env.SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
	throw new Error('SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be set (see .env.example)');
}

export const ROUTE_BUCKET = 'angels-routes';

// Walker requests talk to Supabase as an anonymous visitor, using the
// publishable key. That key can only call the angels_* functions, which check
// the walker's token; the tables themselves are organiser-only.
export const supabase = createClient(url, key, {
	auth: { persistSession: false, autoRefreshToken: false }
});

// Organiser pages use a client carrying the signed-in organiser's session.
export function createSessionClient(cookies: Cookies) {
	return createServerClient(url!, key!, {
		cookies: {
			getAll: () => cookies.getAll(),
			setAll: (toSet) => {
				for (const { name, value, options } of toSet) {
					cookies.set(name, value, { ...options, path: '/' });
				}
			}
		}
	});
}
