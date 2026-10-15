// A hidden "website" field that people never see but form-filling bots tend
// to complete. The group passphrase itself is checked on the server (see
// src/lib/server/walkers.ts), so it can't be skipped.
export function isBot(body: { website?: unknown }) {
	return String(body.website ?? '').trim() !== '';
}
