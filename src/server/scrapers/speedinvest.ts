import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.speedinvest.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
const PACE_MS = 150;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio is a list of collapsible rows, fifty to a page,
// with a link to the next and a count of the pages. a row carries all that
// its panel shows: the company's name, its sectors ("Fintech & DeFi", and
// "Exits" for one the fund is out of), the year the fund invested, its
// country, hidden until the panel opens, and its site, handed to a script
// that draws the "Links" anchor. the fund's bot filter turned the deployed
// app away in 2025 — the site answered a laptop and nothing else — which is
// why the fund was dropped once; a 403 says so, should it come back.

const HEADERS = {
	'User-Agent': UA,
	Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
	'Accept-Language': 'en-US,en;q=0.9'
};

const ROW = 'class="portfolio-list_dropdown w-dropdown"';
const NAME = /fs-list-field="itemTitle"[^>]*>([\s\S]*?)<\/h6>/;
const SECTOR = /<div fs-list-field="portfolio">([\s\S]*?)<\/div>/g;
const COUNTRY = /<div class="hide"><div fs-list-field="portfolio">([\s\S]*?)<\/div>/;
const YEAR = /fs-list-field="date">([^<]*)</;
const SITE = /data-fullurl="(https?:\/\/[^"]+)"/;
// the next page is prerendered beside the count of pages, both naming the
// list's own query parameter
const PAGES = /href="\?([a-z0-9]+_page)=2"\s*\/><div aria-label="Page 1 of (\d+)"/;
const EXITS = /^exits$/i;
const STEALTH = /^stealth\b/i;

const text = (s: string) =>
	s
		.replace(/<[^>]+>/g, ' ')
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&#0?39;|&#8217;|&#x27;|&rsquo;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&#8211;/g, '–')
		.replace(/&nbsp;| /g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => text(s).replace(/\s*,\s*/g, ' / ');

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchPage(url: string): Promise<string> {
	const resp = await fetch(url, { headers: HEADERS });
	if (resp.status === 403) {
		throw new Error('speedinvest: refused this request (403) — the site may only answer fetches run locally');
	}
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

// the rows of one page, added to the list; how many there were
function readPage(html: string, companies: ScrapedCompany[], seen: Set<string>): number {
	let found = 0;
	for (const row of html.split(ROW).slice(1)) {
		const name = text(row.match(NAME)?.[1] ?? '');
		if (!name) continue;
		found++;
		if (STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		// the collapsed row lists the sectors; the country sits in the panel
		// below it, tagged the same way, so only the row is read for sectors
		const sectors = [...row.split('<nav')[0].matchAll(SECTOR)].map(([, s]) => tag(s));
		const country = tag(row.match(COUNTRY)?.[1] ?? '');
		const year = text(row.match(YEAR)?.[1] ?? '');
		const site = row.match(SITE)?.[1] ?? '';
		companies.push({
			name,
			category: [
				...sectors.filter((s) => !EXITS.test(s)),
				country,
				year ? `Invested ${year}` : '',
				sectors.some((s) => EXITS.test(s)) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: site || PAGE_URL
		});
	}
	return found;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const first = await fetchPage(PAGE_URL);
	const [, param, count] = first.match(PAGES) ?? [];
	const pages = Number(count ?? 0);
	if (!param || !pages) {
		throw new Error('speedinvest: the portfolio pagination is not where it was — the page layout moved');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	const perPage = readPage(first, companies, seen);
	for (let page = 2; page <= pages; page++) {
		await wait(PACE_MS);
		const found = readPage(await fetchPage(`${PAGE_URL}?${param}=${page}`), companies, seen);
		// a short page before the last means the pagination stopped serving;
		// a part of the list must not pass for the whole
		if (found === 0 || (page < pages && found < perPage)) {
			throw new Error(`speedinvest: page ${page} of ${pages} came with ${found} companies`);
		}
	}

	if (companies.length === 0) {
		throw new Error('speedinvest: no companies in the portfolio list');
	}
	// without the tags every company would import uncategorised
	if (!companies.some((company) => company.category)) {
		throw new Error('speedinvest: the portfolio tags are not where they were — the row markup moved');
	}

	return companies;
}
