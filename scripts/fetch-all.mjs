// Nightly fetch-all: refreshes every fund on the production deployment by
// calling the same endpoint the dashboard's "fetch all" button uses, five
// funds at a time. Plain Node, no dependencies — runs on a bare CI runner.
//
//   node scripts/fetch-all.mjs                  refresh every fund
//   node scripts/fetch-all.mjs --only a16z,gv   refresh a subset (smoke test)
//   node scripts/fetch-all.mjs --force          ...even if one just ran
//
// A full run stands down when most of the list was refreshed in the last
// MIN_GAP_HOURS (12): a second run of the day finds nothing and clears the
// newcomers the first one marked.
//
// What each fund gained lands in fetch-results.json, which post-newcomers.mjs
// reads to announce the night's finds.

import { readFileSync, writeFileSync } from 'node:fs';

const BASE_URL = process.env.BASE_URL ?? 'https://portfolio-alert.vercel.app';
const CONCURRENCY = 5;
// fetchFund aborts its scrape after 4 minutes; give the request a little more
const REQUEST_TIMEOUT = 300_000;

const arg = (name) => {
	const found = process.argv.find((a) => a === name || a.startsWith(`${name}=`));
	return found?.includes('=') ? found.slice(found.indexOf('=') + 1) : undefined;
};

const only = arg('--only')?.split(',').filter(Boolean);
const RESULTS_FILE = arg('--results') ?? 'fetch-results.json';
const FORCE = process.argv.includes('--force');
// how recently a full refresh must have run for this one to stand down; 0
// turns the check off
const MIN_GAP_HOURS = Number(process.env.MIN_GAP_HOURS ?? 12);
// the share of the list that must be that fresh to call it a full refresh
const FRESH_SHARE = 0.8;

// the fund list comes from the repo's canonical registry, not from the API:
// the API only lists funds that have been fetched at least once, so a fund
// newly added to funds.ts would otherwise never get its first fetch
const registry = readFileSync(new URL('../src/shared/funds.ts', import.meta.url), 'utf8');
// a name holding an apostrophe is written in double quotes, so both kinds count
let funds = [...registry.matchAll(/slug: '([^']+)',\s*name: (?:'([^']*)'|"([^"]*)")/gs)].map(
	(m) => ({ slug: m[1], name: m[2] ?? m[3] })
);
if (funds.length === 0) {
	console.error('no funds parsed from src/shared/funds.ts');
	process.exit(1);
}
// a fund the pattern cannot read would be skipped every night without a word,
// so the count is checked against the slugs the registry declares
const declared = [...registry.matchAll(/\bslug: '/g)].length;
if (funds.length !== declared) {
	console.error(`parsed ${funds.length} funds but the registry declares ${declared}`);
	process.exit(1);
}

// how many funds the app says were refreshed within the last `hours`
async function freshlyFetched(hours) {
	try {
		const resp = await fetch(`${BASE_URL}/api/funds?_limit=1000`, {
			signal: AbortSignal.timeout(30_000)
		});
		if (!resp.ok) throw new Error(String(resp.status));
		const rows = await resp.json();
		const cutoff = Date.now() - hours * 3_600_000;
		return rows.filter((f) => f.lastFetchedAt && Date.parse(f.lastFetchedAt) > cutoff).length;
	} catch (err) {
		// a check that cannot be made must never be the reason a night is missed
		console.log(`could not read when the funds were last refreshed (${String(err).slice(0, 80)})`);
		return undefined;
	}
}

// A refresh that lands a few hours after the last one finds nothing — the
// previous run already took it — and clears the isNewcomer flags that run
// set, so the night's finds disappear off the fund cards. Github's scheduler
// is late often enough that a hand-started run and a late nightly can land
// the same morning: so a full run stands down when the list has just been
// refreshed, and the newcomer flags survive for MIN_GAP_HOURS.
//
// A subset run never stands down: it is a smoke test or a new fund's first
// import, and neither is a duplicate of anything.
if (!only && !FORCE && MIN_GAP_HOURS > 0) {
	const fresh = await freshlyFetched(MIN_GAP_HOURS);
	// a couple of funds fail every night and a newly added one is imported on
	// its own, so a full refresh is recognised by most of the list being fresh
	// rather than all of it
	if (fresh !== undefined && fresh >= funds.length * FRESH_SHARE) {
		console.log(
			`${fresh} of ${funds.length} funds were refreshed in the last ${MIN_GAP_HOURS}h — ` +
				'a full refresh has already run today. Standing down; pass --force to refresh anyway.'
		);
		// an empty results file keeps post-newcomers.mjs quiet, rather than
		// leaving it to announce whatever an earlier run left lying about
		writeFileSync(RESULTS_FILE, '[]');
		process.exit(0);
	}
}

if (only) funds = funds.filter((f) => only.includes(f.slug));
console.log(`refreshing ${funds.length} funds against ${BASE_URL}\n`);

const results = [];
const queue = [...funds];

async function worker() {
	for (let fund = queue.shift(); fund; fund = queue.shift()) {
		const started = Date.now();
		try {
			const resp = await fetch(`${BASE_URL}/api/fetchFund`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ args: [fund.slug] }),
				signal: AbortSignal.timeout(REQUEST_TIMEOUT)
			});
			const seconds = Math.round((Date.now() - started) / 1000);
			if (!resp.ok) {
				const body = await resp.text();
				const message = (() => {
					try {
						return JSON.parse(body).message ?? body;
					} catch {
						return body;
					}
				})();
				results.push({
					slug: fund.slug,
					name: fund.name,
					error: `${resp.status} ${message}`.slice(0, 200)
				});
				console.log(`FAIL ${fund.slug.padEnd(20)} ${seconds}s  ${message.slice(0, 120)}`);
			} else {
				const { data } = await resp.json();
				results.push({ slug: fund.slug, name: fund.name, ...data });
				console.log(`ok   ${fund.slug.padEnd(20)} ${seconds}s  ${data.total} companies, ${data.added} new`);
			}
		} catch (err) {
			const seconds = Math.round((Date.now() - started) / 1000);
			results.push({ slug: fund.slug, name: fund.name, error: String(err).slice(0, 200) });
			console.log(`FAIL ${fund.slug.padEnd(20)} ${seconds}s  ${String(err).slice(0, 120)}`);
		}
	}
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

const failed = results.filter((r) => r.error);
const added = results.reduce((n, r) => n + (r.added ?? 0), 0);
console.log(`\n${results.length - failed.length}/${results.length} funds refreshed, ${added} newcomers`);
if (failed.length) {
	console.log(`failed: ${failed.map((f) => f.slug).join(', ')}`);
}

// what the run found, for post-newcomers.mjs
writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));

// a summary for the workflow-run page
if (process.env.GITHUB_STEP_SUMMARY) {
	const { appendFileSync } = await import('node:fs');
	const lines = [
		`## fetch all — ${results.length - failed.length}/${results.length} funds, ${added} newcomers`,
		'',
		...results
			.filter((r) => r.added > 0)
			.map((r) => `- **${r.slug}**: ${r.added} new`),
		...failed.map((f) => `- ❌ **${f.slug}**: ${f.error}`)
	];
	appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
}

// one stubborn site (speedinvest refuses datacenter addresses) must not turn
// every night red — only a broad failure fails the run
process.exit(failed.length > results.length * 0.2 ? 1 : 0);
