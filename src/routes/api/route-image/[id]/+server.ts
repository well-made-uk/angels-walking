import { error } from '@sveltejs/kit';
import { ROUTE_BUCKET, isNotFound, storage } from '$lib/server/appwrite';
import type { RequestHandler } from './$types';

const TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

// Route images sit in a private bucket. The page only ever links to one for a
// logged-in walker or an organiser, and the file id is random and never listed,
// so this serves any image whose id you hold (like the signed links it replaces).
export const GET: RequestHandler = async ({ params }) => {
	if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/.test(params.id)) error(404);
	try {
		const [file, data] = await Promise.all([
			storage.getFile({ bucketId: ROUTE_BUCKET, fileId: params.id }),
			storage.getFileView({ bucketId: ROUTE_BUCKET, fileId: params.id })
		]);
		return new Response(data, {
			headers: {
				'content-type': file.mimeType || TYPES[file.name.split('.').pop() ?? ''] || 'application/octet-stream',
				// A replaced image gets a new id, so this never goes stale.
				'cache-control': 'private, max-age=31536000, immutable',
				'x-robots-tag': 'noindex'
			}
		});
	} catch (e) {
		if (isNotFound(e)) error(404);
		console.error(e);
		error(503, 'Could not load that image.');
	}
};
