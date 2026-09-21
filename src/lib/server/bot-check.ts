// A hidden "website" field that people never see but form-filling bots tend
// to complete. The human-check question itself is checked by the database
// (see angels_private.check_answer), so it can't be skipped.
export function isBot(body: { website?: unknown }) {
	return String(body.website ?? '').trim() !== '';
}
