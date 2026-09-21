export type Difficulty = 'easy' | 'moderate' | 'challenging';

export interface Walk {
	id: string;
	title: string;
	description: string | null;
	/** Null while the date is being voted on. */
	starts_at: string | null;
	walk_date: string | null;
	walk_month: string;
	/** The days on offer while the date is being voted on. */
	vote_options: string[] | null;
	/** Organiser's own last voting day (null = 2 weeks before the first option). */
	vote_deadline: string | null;
	start_time: string;
	votes_close_at: string | null;
	meeting_point: string;
	distance_km: number | null;
	duration_mins: number | null;
	difficulty: Difficulty | null;
	max_people: number | null;
	notes: string | null;
	cancelled: boolean;
	route_image_path: string | null;
	route_image_url?: string | null;
	suggestion_id: string | null;
	suggestion?: { suggested_by: string | null } | null;
	signups: { id: string; name: string; created_at: string }[];
}

export interface Suggestion {
	id: string;
	title: string;
	details: string | null;
	created_at: string;
	votes: number;
	promoted: boolean;
}

/** Organisers also see who suggested each idea. */
export interface OrganiserSuggestion extends Suggestion {
	suggested_by: string | null;
}

/** A walk as a logged-in walker sees it (from angels_walker_feed). */
export interface FeedWalk {
	id: string;
	title: string;
	description: string | null;
	starts_at: string | null;
	walk_date: string | null;
	walk_month: string;
	vote_options: string[] | null;
	start_time: string;
	votes_close_at: string | null;
	meeting_point: string;
	distance_km: number | null;
	duration_mins: number | null;
	difficulty: Difficulty | null;
	max_people: number | null;
	notes: string | null;
	cancelled: boolean;
	route_image_url: string | null;
	suggested_by: string | null;
	signups: { id: string; name: string; created_at: string }[];
	tallies: { date: string; votes: number }[];
	voters: number;
}

export interface Feed {
	walks: FeedWalk[];
	suggestions: OrganiserSuggestion[];
}

export interface DateTally {
	date: string;
	votes: number;
}

export interface DatePoll {
	options: DateTally[];
	voters: number;
}

/** Organiser pages (walkers get walks from the feed instead). */
export const WALK_COLUMNS =
	'id, title, description, starts_at, walk_date, walk_month, vote_options, vote_deadline, start_time, votes_close_at, meeting_point, distance_km, duration_mins, difficulty, max_people, notes, cancelled, route_image_path, route_image_url, suggestion_id, suggestion:angels_suggestions(suggested_by), signups:angels_signups(id, name, created_at)';

/** Organiser walk form fields, as strings from the form. */
export interface WalkFormValues {
	title: string;
	description: string;
	meeting_point: string;
	distance_km: string;
	duration_hours: string;
	duration_minutes: string;
	difficulty: string;
	max_people: string;
	notes: string;
	start_time: string;
	date_mode: 'vote' | 'fixed';
	/** Date range shown in the vote calendar, and the days picked from it. */
	range_start: string;
	range_end: string;
	vote_options: string[];
	/** Custom last voting day, or '' for the automatic one. */
	vote_deadline: string;
	walk_date: string;
	suggestion_id: string;
	cancelled: boolean;
	remove_image: boolean;
}

export type WalkFormErrors = Partial<Record<keyof WalkFormValues | 'route_image' | 'form', string>>;
