import type { SupabaseClient } from '@supabase/supabase-js';
import { signRouteImage } from '$lib/server/route-images';
import { ROUTE_BUCKET } from '$lib/server/supabase';
import type { Difficulty, WalkFormErrors, WalkFormValues } from '$lib/types';
import { lastVotingDay, MAX_RANGE_DAYS, MAX_VOTE_DAYS, daysBetween } from '$lib/walks';
import { dayLabel } from '$lib/format';

const DIFFICULTIES: Difficulty[] = ['easy', 'moderate', 'challenging'];
const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const str = (data: FormData, key: string, max = 2000) =>
	String(data.get(key) ?? '')
		.trim()
		.slice(0, max);

export function readWalkForm(data: FormData) {
	const values: WalkFormValues = {
		title: str(data, 'title', 120),
		description: str(data, 'description', 2000),
		meeting_point: str(data, 'meeting_point', 200),
		distance_km: str(data, 'distance_km', 10),
		duration_hours: str(data, 'duration_hours', 3),
		duration_minutes: str(data, 'duration_minutes', 3),
		difficulty: str(data, 'difficulty', 20),
		max_people: str(data, 'max_people', 5),
		notes: str(data, 'notes', 1000),
		start_time: str(data, 'start_time', 8),
		date_mode: str(data, 'date_mode') === 'fixed' ? 'fixed' : 'vote',
		range_start: str(data, 'range_start', 10),
		range_end: str(data, 'range_end', 10),
		vote_options: [...new Set(data.getAll('vote_options').map(String))]
			.filter((d) => ISO_DAY.test(d))
			.sort()
			.slice(0, MAX_VOTE_DAYS + 1),
		vote_deadline: data.get('custom_deadline') === 'on' ? str(data, 'vote_deadline', 10) : '',
		walk_date: str(data, 'walk_date', 10),
		suggestion_id: str(data, 'suggestion_id', 36),
		cancelled: data.get('cancelled') === 'on',
		remove_image: data.get('remove_image') === 'on'
	};

	const errors: WalkFormErrors = {};
	if (!values.title) errors.title = 'Give the walk a name.';
	if (!values.description) errors.description = 'Describe the route, even roughly.';
	if (!values.meeting_point) errors.meeting_point = 'Where should people meet?';

	const km = Number(values.distance_km);
	if (!values.distance_km || !(km > 0 && km <= 100)) errors.distance_km = 'Enter the length in km, e.g. 5.5';

	const mins = Number(values.duration_hours || 0) * 60 + Number(values.duration_minutes || 0);
	if (!(mins > 0 && mins <= 12 * 60)) errors.duration_hours = 'Roughly how long will it take?';

	if (!DIFFICULTIES.includes(values.difficulty as Difficulty)) errors.difficulty = 'Pick a difficulty.';

	if (values.max_people && !(Number.isInteger(Number(values.max_people)) && Number(values.max_people) > 0)) {
		errors.max_people = 'Leave empty for no limit, or enter a whole number.';
	}

	if (!/^\d{2}:\d{2}$/.test(values.start_time)) errors.start_time = 'What time does it start?';

	if (values.date_mode === 'fixed') {
		if (!ISO_DAY.test(values.walk_date)) errors.walk_date = 'Pick the date.';
	} else if (!ISO_DAY.test(values.range_start) || !ISO_DAY.test(values.range_end) || values.range_end < values.range_start) {
		errors.range_start = 'Pick the first and last days of the range.';
	} else if (daysBetween(values.range_start, values.range_end).length > MAX_RANGE_DAYS) {
		errors.range_start = 'Keep the range to about three months.';
	} else if (!values.vote_options.length) {
		errors.vote_options = 'Tick at least one day for people to vote on.';
	} else if (values.vote_options.length > MAX_VOTE_DAYS) {
		errors.vote_options = `That's a lot of days - pick ${MAX_VOTE_DAYS} or fewer.`;
	} else if (data.get('custom_deadline') === 'on') {
		const today = new Date().toISOString().slice(0, 10);
		if (!ISO_DAY.test(values.vote_deadline)) errors.vote_deadline = 'Pick the last day people can vote.';
		else if (values.vote_deadline < today) errors.vote_deadline = 'The deadline can’t be in the past.';
		else if (values.vote_deadline >= values.vote_options[0]) {
			errors.vote_deadline = 'The deadline needs to be before the first day on offer.';
		}
	}

	if (values.suggestion_id && !UUID.test(values.suggestion_id)) values.suggestion_id = '';

	const image = data.get('route_image');
	const file = image instanceof File && image.size > 0 ? image : null;
	if (file && !IMAGE_TYPES[file.type]) errors.route_image = 'Use a JPEG, PNG or WebP image.';
	else if (file && file.size > MAX_IMAGE_BYTES) errors.route_image = 'That image is over 5MB.';

	return { values, errors, file, durationMins: mins };
}

interface Existing {
	id: string;
	walk_date: string | null;
	vote_options: string[] | null;
	route_image_path: string | null;
}

/** Create (when `existing` is null) or update a walk. Returns the walk id, or an error message. */
export async function saveWalk(
	supabase: SupabaseClient,
	form: ReturnType<typeof readWalkForm>,
	existing: Existing | null
): Promise<{ id: string } | { error: string; field?: keyof WalkFormErrors }> {
	const { values, file, durationMins } = form;
	const id = existing?.id ?? crypto.randomUUID();

	// A vote needs time to happen: voting closes 2 weeks before the earliest
	// day on offer. (Checked when the days change; leaving them alone is fine.)
	const optionsChanged =
		!existing || existing.walk_date !== null || (existing.vote_options ?? []).join() !== values.vote_options.join();
	// (A custom deadline is checked when the form is read.)
	if (values.date_mode === 'vote' && optionsChanged && !values.vote_deadline) {
		const today = new Date().toISOString().slice(0, 10);
		const first = values.vote_options[0];
		if (lastVotingDay(first) < today) {
			return {
				field: 'vote_options',
				error: `Voting would already be closed, because ${dayLabel(first, 'long')} is less than 2 weeks away. Set your own voting deadline below, untick the earliest days, or pick a fixed date.`
			};
		}
	}

	let imagePath = existing?.route_image_path ?? null;
	const oldImage = imagePath;
	let imageLink: { route_image_url: string | null; route_image_url_expires: string | null } | undefined;
	if (file) {
		imagePath = `${id}/${crypto.randomUUID()}.${IMAGE_TYPES[file.type]}`;
		const up = await supabase.storage
			.from(ROUTE_BUCKET)
			.upload(imagePath, file, { contentType: file.type, cacheControl: '31536000' });
		if (up.error) {
			console.error(up.error);
			return { field: 'route_image', error: 'Could not upload the route image. Please try again.' };
		}
		imageLink = (await signRouteImage(supabase, imagePath)) ?? { route_image_url: null, route_image_url_expires: null };
	} else if (values.remove_image) {
		imagePath = null;
		imageLink = { route_image_url: null, route_image_url_expires: null };
	}

	const row = {
		title: values.title,
		description: values.description,
		meeting_point: values.meeting_point,
		distance_km: Number(values.distance_km),
		duration_mins: durationMins,
		difficulty: values.difficulty,
		max_people: values.max_people ? Number(values.max_people) : null,
		notes: values.notes || null,
		start_time: values.start_time,
		cancelled: values.cancelled,
		route_image_path: imagePath,
		...(imageLink ?? {}),
		...(values.date_mode === 'fixed'
			? { walk_date: values.walk_date }
			: {
					walk_date: null,
					vote_options: values.vote_options,
					// The database works out the closing time from this.
					vote_deadline: values.vote_deadline || null
				})
	};

	const res = existing
		? await supabase.from('angels_walks').update(row).eq('id', id)
		: await supabase
				.from('angels_walks')
				.insert({ id, ...row, suggestion_id: values.suggestion_id || null });

	if (res.error) {
		console.error(res.error);
		if (file && imagePath) await supabase.storage.from(ROUTE_BUCKET).remove([imagePath]);
		return { error: 'Could not save the walk. Please try again.' };
	}

	if (oldImage && oldImage !== imagePath) {
		await supabase.storage.from(ROUTE_BUCKET).remove([oldImage]);
	}

	return { id };
}
