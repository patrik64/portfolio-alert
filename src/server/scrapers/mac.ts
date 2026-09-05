import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://macventurecapital.com/portfolio/';
const ACQUIRED_URL = `${PAGE_URL}?stage=acquired`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, with the whole portfolio on the one page and each company written
// as a row: its name, the fund's own page for it, a line about what it does
// and the address of the company itself, tucked in the panel that opens under
// a cursor.
//
// what a company is filed under is in the row's class — tag_ai-ml,
// region_africa — and the words for those are in the filters above the list,
// which is where they are taken from, so that AI/ML and Aerospace & Defense
// read as the fund writes them rather than as a class turned back into words.
// two of those words are themselves lists, so their commas become slashes: the
// category is joined with commas.
//
// where a company has gone is the one thing the row does not say. the fund
// filters on it instead, so the acquired list is asked for as well and the
// companies on it are marked in the fund's own word. Active, which is what the
// other filter says, is the ordinary case and is left off.

const FILTER = /href="[^"]*\/portfolio\/\?(category|region|stage)=([^"&]*)"[^>]*>([\s\S]*?)<\/a>/g;
const ITEM = /(?=<li class="portfolio-listing__item)/;
const CLASSES = /^<li class="portfolio-listing__item([^"]*)"/;
const SLUG = /href="[^"]*\/portfolio\/([^"/]+)\/"/;
const TITLE = /class="[^"]*portfolio-listing__title"[^>]*>([\s\S]*?)<\/a>/;
const SITE = /<h3>Website<\/h3>\s*<a\b[^>]*?\bhref="([^"]*)"/;

const clean = (s: string) =>
	s
		.replace(/<[^>]+>/g, ' ')
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;|&#8220;|&#8221;/g, '"')
		.replace(/&nbsp;| /g, ' ')
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

// a word of the fund's that is itself a list keeps its parts, but not the
// commas between them, since the category is joined with those
const part = (s: string) => clean(s).replace(/\s*,\s*(?:and\s+|&\s+)?/g, ' / ');

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

const rows = (html: string) => html.split(ITEM).slice(1);
const slugOf = (row: string) => row.match(SLUG)?.[1] ?? '';

export async function scrape(): Promise<ScrapedCompany[]> {
	const [html, acquiredPage] = await Promise.all([fetchText(PAGE_URL), fetchText(ACQUIRED_URL)]);

	// the words the fund puts to the classes it files a company under
	const said = new Map<string, string>();
	for (const filter of html.matchAll(FILTER)) {
		const label = part(filter[3]);
		if (label) said.set(`${filter[1]}:${filter[2]}`, label);
	}

	const listing = rows(html);
	if (listing.length === 0) {
		throw new Error('mac: no companies in the portfolio');
	}

	const acquired = new Set(rows(acquiredPage).map(slugOf).filter(Boolean));
	// a filter that has stopped filtering hands back the whole portfolio
	if (acquired.size >= listing.length) {
		throw new Error('mac: the acquired filter no longer picks a company out');
	}

	const companies: ScrapedCompany[] = [];
	for (const row of listing) {
		const name = clean(row.match(TITLE)?.[1] ?? '');
		if (!name) continue;

		const classes = (row.match(CLASSES)?.[1] ?? '').split(/\s+/);
		const filed = (prefix: string, group: string) =>
			classes
				.filter((cls) => cls.startsWith(prefix))
				.map((cls) => said.get(`${group}:${cls.slice(prefix.length)}`))
				.filter((label): label is string => Boolean(label));

		const gone = acquired.has(slugOf(row)) ? (said.get('stage:acquired') ?? 'Acquired') : '';
		const url = clean(row.match(SITE)?.[1] ?? '');

		companies.push({
			name,
			category: [...filed('tag_', 'category'), ...filed('region_', 'region'), gone]
				.filter(Boolean)
				.join(', '),
			url: /^https?:\/\//i.test(url) ? url : ''
		});
	}

	return companies;
}
