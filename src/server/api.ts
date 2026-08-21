import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { SqlDatabase } from 'remult';
import { remultApi } from 'remult/remult-sveltekit';
import { PostgresDataProvider } from 'remult/postgres';
import pg from 'pg';
import { Company } from '../shared/Company';
import { Fund } from '../shared/Fund';
import { ScrapeController } from '../shared/ScrapeController';

function supabaseDataProvider() {
	if (!env.DATABASE_URL) return undefined; // JSON files under ./db (local dev)
	// modest pool — DATABASE_URL points at Supabase's transaction-mode pgbouncer (:6543)
	const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 10 });
	// idle pooled connections can drop (transient network errors); without a
	// listener, node crashes on the pool's unhandled 'error' event
	pool.on('error', (err) => console.error('postgres pool error:', err.message));
	// the pool only listens while a client sits idle; one that drops while
	// checked out between two queries emits its own 'error' event, and that
	// unhandled event took the dev server down once. pg marks such a client
	// unqueryable before emitting, so logging is all that is left to do
	pool.on('connect', (client) =>
		client.on('error', (err) => console.error('postgres client error:', err.message))
	);
	return new SqlDatabase(new PostgresDataProvider(pool));
}

export const api = remultApi({
	entities: [Fund, Company],
	controllers: [ScrapeController],
	admin: dev,
	dataProvider: supabaseDataProvider()
});
