import type { ScrapedCompany } from './types';

const BASE_URL = 'https://powerhouse-ventures.co';
const PORTFOLIO_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BATCH_SIZE = 10;

// framer. the grid names its companies and says what each one does, but the
// link to the company itself is only on the company's own page, so the grid is
// read for the set of companies and the pages for the rest.
//
// the grid is what the fund presents as its portfolio, so it is what the list
// comes from rather than the sitemap: the sitemap carries a page the grid does
// not show, and would keep carrying one the fund had taken down.
//
// a page gives the company's name as its title, the sector the fund files it
// under and the stage it is at. the stage doubles as how the investment ended
// — nine say Acquired — so it goes after the sector, where a status belongs.
//
// one company is in stealth and published under no name. several of those
// would collapse into one another, since a company is known by its name here,
// so it is left out until the fund names it.

const SLUG = /\/portfolio\/([a-z0-9][a-z0-9-]*)/g;
const TITLE = /<title>([^<]*)<\/title>/;
const FIELD = (name: string) =>
	new RegExp(`data-framer-name="${name}"[\\s\\S]{0,600}?<p[^>]*class="framer-text">([^<]*)<`);
const SITE = /data-framer-name="Website"[\s\S]{0,400}?href="(https?:\/\/[^"]+)"/;
// a company the fund carries but does not name
const UNNAMED = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a sector the fund wrote with a comma in it
// would read as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

async function fetchCompany(slug: string): Promise<ScrapedCompany | undefined> {
	const url = `${PORTFOLIO_URL}/${slug}`;
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) return undefined;
	const html = await resp.text();

	const name = clean(html.match(TITLE)?.[1] ?? '');
	if (!name || UNNAMED.test(name)) return undefined;

	return {
		name,
		category: [tag(html.match(FIELD('Sector'))?.[1] ?? ''), tag(html.match(FIELD('Stage'))?.[1] ?? '')]
			.filter(Boolean)
			.join(', '),
		url: html.match(SITE)?.[1] ?? url
	};
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PORTFOLIO_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PORTFOLIO_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const slugs = [...new Set([...html.matchAll(SLUG)].map((m) => m[1]))];
	if (slugs.length === 0) {
		throw new Error('powerhouse: no companies on the portfolio page');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (let i = 0; i < slugs.length; i += BATCH_SIZE) {
		const found = await Promise.all(slugs.slice(i, i + BATCH_SIZE).map(fetchCompany));
		for (const company of found) {
			if (!company || seen.has(company.name.toLowerCase())) continue;
			seen.add(company.name.toLowerCase());
			companies.push(company);
		}
	}

	if (companies.length === 0) {
		throw new Error('powerhouse: no companies behind the portfolio grid');
	}

	return companies;
}
