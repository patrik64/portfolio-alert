// Nightly fetch-all: refreshes every fund on the production deployment by
// calling the same endpoint the dashboard's "fetch all" button uses, five
// funds at a time. Plain Node, no dependencies — runs on a bare CI runner.
//
//   node scripts/fetch-all.mjs                  refresh every fund
//   node scripts/fetch-all.mjs --only a16z,gv   refresh a subset (smoke test)
//
// What each fund gained lands in fetch-results.json, which post-newcomers.mjs
// reads to announce the night's finds.

import { writeFileSync } from 'node:fs';

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

const fundsResp = await fetch(`${BASE_URL}/api/funds?_limit=1000`);
if (!fundsResp.ok) {
	console.error(`failed to list funds: ${fundsResp.status}`);
	process.exit(1);
}
let funds = await fundsResp.json();
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
