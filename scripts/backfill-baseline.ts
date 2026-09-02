// One-off backfill: mark the rows each fund's very first fetch imported (its
// baseline portfolio) with isBaseline, using the same Vienna-day rule as the
// rss feed — expressed in SQL, so ~50k rows update in one statement instead of
// row by row through the pooler. Safe to re-run: marked rows are skipped.
//
//   pnpm exec tsx scripts/backfill-baseline.ts
import pg from 'pg';
import { Remult, SqlDatabase } from 'remult';
import { PostgresDataProvider } from 'remult/postgres';
import { Company } from '../src/shared/Company';

process.loadEnvFile();
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const remult = new Remult(new SqlDatabase(new PostgresDataProvider(pool)));

// adds the isBaseline column before the update touches it
await (remult.dataProvider as SqlDatabase).ensureSchema([remult.repo(Company).metadata]);

const result = await pool.query(
	`UPDATE companies c
	 SET "isBaseline" = true
	 FROM (SELECT "fundSlug", min("firstSeenAt") AS first FROM companies GROUP BY "fundSlug") f
	 WHERE c."fundSlug" = f."fundSlug"
	   AND NOT c."isBaseline"
	   AND c."firstSeenAt" <= (((f.first AT TIME ZONE $1)::date + 1)::timestamp AT TIME ZONE $1)`,
	['Europe/Vienna']
);
console.log(`done — ${result.rowCount} rows marked baseline`);
await pool.end();
