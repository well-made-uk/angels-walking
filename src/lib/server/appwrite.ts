import { Account, AppwriteException, Client, ID, Models, Query, Storage, TablesDB, Users } from 'node-appwrite';
import { env } from '$env/dynamic/private';

const endpoint = env.AW_ENDPOINT || 'https://fra.cloud.appwrite.io/v1';

export const DATABASE = env.AW_DATABASE_ID || 'angels_walking';
export const ROUTE_BUCKET = 'angels_routes';

// Everything runs on the server with an API key: the tables and bucket have no
// public permissions, so the browser can't reach them directly. Access rules
// (walker tokens, organiser sessions) are enforced in our own code.
function config() {
	const project = env.AW_PROJECT_ID;
	const key = env.AW_API_KEY;
	if (!project || !key) throw new Error('AW_PROJECT_ID and AW_API_KEY must be set (see .env.example)');
	return { project, key };
}

let adminClient: Client | undefined;
const admin = () => {
	if (!adminClient) {
		const { project, key } = config();
		adminClient = new Client().setEndpoint(endpoint).setProject(project).setKey(key);
	}
	return adminClient;
};

// Created on first use, so building the site doesn't need the keys.
function lazy<T extends object>(make: () => T): T {
	let instance: T | undefined;
	return new Proxy({} as T, {
		get(_, prop) {
			instance ??= make();
			const value = Reflect.get(instance, prop);
			return typeof value === 'function' ? value.bind(instance) : value;
		}
	});
}

export const tables = lazy(() => new TablesDB(admin()));
export const storage = lazy(() => new Storage(admin()));
export const users = lazy(() => new Users(admin()));

/**
 * Sign-in calls (email codes and sessions) go through the API key client: that
 * is what makes Appwrite return the session secret we store in a cookie.
 */
export const adminAccount = lazy(() => new Account(admin()));

/** A client acting as a signed-in organiser (their Appwrite session secret). */
export function sessionAccount(secret: string) {
	return new Account(new Client().setEndpoint(endpoint).setProject(config().project).setSession(secret));
}

export { ID, Query };

export type Row<T> = Models.Row & T;

export const isNotFound = (e: unknown) => e instanceof AppwriteException && e.code === 404;
export const isConflict = (e: unknown) => e instanceof AppwriteException && e.code === 409;

const PAGE = 100;

/** Every row matching the queries (Appwrite returns 25 by default, so page through). */
export async function listAll<T>(table: string, queries: string[] = []): Promise<Row<T>[]> {
	const out: Row<T>[] = [];
	let cursor: string | undefined;
	for (;;) {
		const page = await tables.listRows<Row<T>>({
			databaseId: DATABASE,
			tableId: table,
			queries: [...queries, Query.limit(PAGE), ...(cursor ? [Query.cursorAfter(cursor)] : [])],
			total: false
		});
		out.push(...page.rows);
		if (page.rows.length < PAGE) return out;
		cursor = page.rows[page.rows.length - 1].$id;
	}
}

export async function getRow<T>(table: string, id: string): Promise<Row<T> | null> {
	try {
		return await tables.getRow<Row<T>>({ databaseId: DATABASE, tableId: table, rowId: id });
	} catch (e) {
		if (isNotFound(e)) return null;
		throw e;
	}
}

export const createRow = <T extends object>(table: string, id: string, data: T) =>
	tables.createRow({ databaseId: DATABASE, tableId: table, rowId: id, data });

export const updateRow = (table: string, id: string, data: object) =>
	tables.updateRow({ databaseId: DATABASE, tableId: table, rowId: id, data });

export async function deleteRow(table: string, id: string) {
	try {
		await tables.deleteRow({ databaseId: DATABASE, tableId: table, rowId: id });
	} catch (e) {
		if (!isNotFound(e)) throw e;
	}
}

/** Delete every row of a table matching the queries. */
export async function deleteWhere(table: string, queries: string[]) {
	for (const row of await listAll(table, queries)) await deleteRow(table, row.$id);
}
