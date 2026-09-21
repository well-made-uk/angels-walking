import type { ActionResult, SubmitFunction } from '@sveltejs/kit';

export interface Walker {
	name: string;
	email: string;
	/** Given by the server after passing the log in check; sent with actions. */
	token: string;
}

const KEY = 'va_walker';

/**
 * Who's using this browser. Walkers sign up with name + email, and log in
 * later with just their email (no passwords; see WalkerModal). We keep the
 * result in localStorage. The database holds the walker record, keyed by
 * email (angels_walkers), and the name shown in the app always comes from it.
 * Only ever populated in the browser.
 */
class WalkerStore {
	current = $state<Walker | null>(null);
	loaded = $state(false);
	asking = $state(false);
	/** Bumped after each walker action, so the page reloads their feed. */
	version = $state(0);
	#pending: ((w: Walker | null) => void) | null = null;

	load() {
		try {
			const raw = localStorage.getItem(KEY);
			const w = raw ? JSON.parse(raw) : null;
			if (w && typeof w.name === 'string' && typeof w.email === 'string' && typeof w.token === 'string') {
				this.current = w;
			}
		} catch {
			// Storage blocked or corrupt: behave as a new visitor.
		}
		this.loaded = true;
	}

	/** Resolve with the current walker, asking for their details first if needed. */
	ensure(): Promise<Walker | null> {
		if (this.current) return Promise.resolve(this.current);
		this.asking = true;
		return new Promise((resolve) => (this.#pending = resolve));
	}

	/** Called once the modal has logged them in or signed them up. */
	confirm(w: Walker) {
		this.set(w);
		this.asking = false;
		this.#pending?.(this.current);
		this.#pending = null;
	}

	/** Store (or refresh) the logged-in walker. */
	set(w: Walker) {
		this.current = { name: w.name, email: w.email.trim().toLowerCase(), token: w.token };
		try {
			localStorage.setItem(KEY, JSON.stringify(this.current));
		} catch {
			// Still works for this visit.
		}
	}

	dismiss() {
		this.asking = false;
		this.#pending?.(null);
		this.#pending = null;
	}

	logout() {
		this.current = null;
		try {
			localStorage.removeItem(KEY);
		} catch {
			// Nothing to clear.
		}
	}
}

export const walker = new WalkerStore();

/**
 * `use:enhance` handler for walker actions: makes sure they're logged in
 * (showing the log in / sign up modal if not), then adds their email to the
 * submission.
 */
export function withWalker(
	opts: { busy?: (b: boolean) => void; reset?: boolean; done?: (result: ActionResult) => void } = {}
): SubmitFunction {
	return async ({ formData, cancel }) => {
		const w = await walker.ensure();
		if (!w) {
			cancel();
			return;
		}
		formData.set('walker_email', w.email);
		formData.set('walker_token', w.token);
		opts.busy?.(true);
		return async ({ update, result }) => {
			await update({ reset: opts.reset ?? false });
			walker.version++;
			opts.busy?.(false);
			opts.done?.(result);
		};
	};
}
