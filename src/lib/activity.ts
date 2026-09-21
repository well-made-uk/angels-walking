import type { Feed } from '$lib/types';

// Everything for a logged-in walker, fetched from /api/me: the walks and ideas
// they can see, and what they've joined and voted for.
export interface MyActivity {
	/** False if this email isn't (or is no longer) a walker. */
	known: boolean;
	/** Their current name, in case it changed. */
	name: string | null;
	joined: string[];
	voted: string[];
	suggested: string[];
	dates: Record<string, string[]>;
	/** Walks and ideas; null until loaded (and for logged-out visitors). */
	feed: Feed | null;
}

export const emptyActivity = (): MyActivity => ({
	known: false,
	name: null,
	joined: [],
	voted: [],
	suggested: [],
	dates: {},
	feed: null
});
