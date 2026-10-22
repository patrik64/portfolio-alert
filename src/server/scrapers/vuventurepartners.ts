import type { ScrapedCompany } from './types';

// the bare domain: www answers with a 301, which would turn the function's
// POST into a GET
const SITE_URL = 'https://vuventurepartners.com';
const PAGE_URL = `${SITE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// base44, since october 2026 (a strikingly page of logos before, whose
// companies had to be named after their addresses): the site is an app drawn
// in the browser, and its portfolio page asks one of the app's backend
// functions, getVUPortfolio, for the companies — which it answers to any
// visitor, signed in or not. a company comes with its name, site, vertical
// and sectors ("Space, Aerospace, & Defense"), stage, where it is and
// whether the fund is out ("Exited: M&A"). the app's id is read from the
// page, where its script names it. the sectors, the stage and the first
// country are kept as tags, a sale with the Acquired tag, an exit with the
// Exited tag.

const APP_ID = /\bappId\s*=\s*"([0-9a-f]{24})"/;
const EXITED = /^exited\b/i;
const ACQUIRED = /\bm\s*&\s*a\b|acqui/i;
const UNSAID = /^(?:-|other|others|all|n\/a|not specified)$/i;
const STEALTH = /^stealth\b/i;

interface Entry {
	name?: unknown;
	websiteUrl?: unknown;
	vertical?: unknown;
	sectors?: unknown;
	companyStage?: unknown;
	locations?: unknown;
	exitStatus?: unknown;
}

const clean = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: unknown) =>
	clean(s)
		.replace(/\s*,\s*&\s*/g, ' & ')
		.replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const page = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!page.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${page.status}`);
	}
	const appId = (await page.text()).match(APP_ID)?.[1];
	if (!appId) {
		throw new Error("vuventurepartners: no app id in the page — the site moved off base44's app shell");
	}

	const url = `${SITE_URL}/api/apps/${appId}/functions/getVUPortfolio`;
	const resp = await fetch(url, {
		method: 'POST',
		headers: {
			'User-Agent': UA,
			'Content-Type': 'application/json',
			Accept: 'application/json',
			'X-App-Id': appId,
			'Base44-Functions-Version': 'prod'
		},
		body: '{}'
	});
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	const rows = ((await resp.json()) as { companies?: unknown }).companies;
	if (!Array.isArray(rows)) {
		throw new Error('vuventurepartners: the portfolio function answered no list of companies');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const row of rows as Entry[]) {
		const name = clean(row.name);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const sectors = Array.isArray(row.sectors) ? row.sectors : [];
		const where = Array.isArray(row.locations) ? (row.locations[0] as { country?: unknown } | undefined) : undefined;
		const exit = clean(row.exitStatus);
		const site = clean(row.websiteUrl);
		companies.push({
			name,
			category: [
				tag(row.vertical),
				...sectors.map(tag),
				tag(row.companyStage),
				tag(where?.country),
				EXITED.test(exit) && ACQUIRED.test(exit) ? 'Acquired' : '',
				EXITED.test(exit) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('vuventurepartners: no companies in the portfolio');
	}

	return companies;
}
