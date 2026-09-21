import type { SupabaseClient } from '@supabase/supabase-js';
import { ROUTE_BUCKET } from '$lib/server/supabase';

// Route images live in a private bucket. Walkers see them through a signed
// link stored on the walk (and only ever sent to logged-in walkers). Only an
// organiser session can create these links, so organiser pages keep them
// fresh.
const LINK_DAYS = 400;
const REFRESH_WITHIN_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

export async function signRouteImage(supabase: SupabaseClient, path: string) {
	const { data, error } = await supabase.storage.from(ROUTE_BUCKET).createSignedUrl(path, LINK_DAYS * 24 * 60 * 60);
	if (error || !data) {
		console.error(error);
		return null;
	}
	return { route_image_url: data.signedUrl, route_image_url_expires: new Date(Date.now() + LINK_DAYS * DAY).toISOString() };
}

/** Create or renew signed links for any walk whose image link is missing or expiring. */
export async function refreshRouteImageLinks(supabase: SupabaseClient) {
	const soon = new Date(Date.now() + REFRESH_WITHIN_DAYS * DAY).toISOString();
	const { data } = await supabase
		.from('angels_walks')
		.select('id, route_image_path, route_image_url')
		.not('route_image_path', 'is', null)
		.or(`route_image_url.is.null,route_image_url_expires.is.null,route_image_url_expires.lt.${soon}`);

	for (const w of data ?? []) {
		let path = w.route_image_path as string;

		// Never signed means it was uploaded while the bucket was public, so a
		// CDN may still serve it at its old public address. Moving it to a new
		// name deletes the old file, which clears that cached copy.
		if (!w.route_image_url) {
			const moved = `${w.id}/${crypto.randomUUID()}${path.slice(path.lastIndexOf('.'))}`;
			const { error } = await supabase.storage.from(ROUTE_BUCKET).move(path, moved);
			if (error) console.error(error);
			else path = moved;
		}

		const link = await signRouteImage(supabase, path);
		if (link) await supabase.from('angels_walks').update({ route_image_path: path, ...link }).eq('id', w.id);
	}
}
