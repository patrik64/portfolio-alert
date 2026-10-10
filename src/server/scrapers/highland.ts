import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.highlandeurope.com';
const PAGE_URL = `${BASE_URL}/companies/`;
const PACE_MS = 150;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the companies page shows a dozen companies, alphabetically,
// and a "Load more" button fetches the next dozen; the same pages are
// served whole at /companies/page/2/ and on, and the first says how many
// there are. a company is a tile that opens to show its site, the month the
// fund invested ("December 2024"), its location ("London, United Kingdom")
// and its news, with an "Exited" badge beside the name of one the fund is
// out of. the year, the city and the country are kept as tags. the sectors
// the page filters by are not on the tiles, and only reach the browser
// through a filter request the page itself cannot be asked for plainly, so
// they are left out. a page that will not load fails the run, as the list
// would be short.

const TILE = /(?=<div class="tile tile--company">)/;
const NAME = /<div class="company__heading__name[^"]*">([\s\S]*?)<\/div>/;
const EXITED = /<span class="company__exited\b/;
const SITE = /<a href="(https?:\/\/[^"]+)"[^>]*class="company__url\b/;
// a labelled fact: its heading, then its value
const FACT = /<h6 class="company__section-title">([^<]*)<\/h6>\s*<div class="company__date">([\s\S]*?)<\/div>/g;
const MAX_PAGE = /"max_page":"(\d+)"/;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`highland: ${url} would not load (${resp.status})`);
	}
	return resp.text();
}

// the tiles of one page, added to the list; how many there were
function readPage(html: string, companies: ScrapedCompany[], seen: Set<string>): number {
	const tiles = html.split(TILE).slice(1);
	for (const tile of tiles) {
		// the badge sits inside the name's own element
		const heading = tile.match(NAME)?.[1] ?? '';
		const name = clean(heading.replace(/<span class="company__exited[\s\S]*?<\/span>/, ''));
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const facts = new Map<string, string>();
		for (const [, label, value] of tile.matchAll(FACT)) facts.set(clean(label).toLowerCase(), clean(value));
		const year = facts.get('invested since')?.match(/\b(?:19|20)\d{2}\b/)?.[0];
		const places = (facts.get('location') ?? '')
			.split(/\s*,\s*/)
			.map(tag)
			.filter(Boolean);
		const site = unescape(tile.match(SITE)?.[1] ?? '').trim();
		const out = EXITED.test(heading);

		companies.push({
			name,
			category: [...places, year ? `Invested ${year}` : '', out ? 'Exited' : '']
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: site || PAGE_URL
		});
	}
	return tiles.length;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const first = await fetchText(PAGE_URL);
	const pages = Number(first.match(MAX_PAGE)?.[1] ?? 0);
	if (!pages) {
		throw new Error('highland: the page no longer says how many pages of companies it has — the layout moved');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	const perPage = readPage(first, companies, seen);
	for (let page = 2; page <= pages; page++) {
		await wait(PACE_MS);
		const found = readPage(await fetchText(`${BASE_URL}/companies/page/${page}/`), companies, seen);
		// a short page before the last means the paging stopped serving; a
		// part of the list must not pass for the whole
		if (found === 0 || (page < pages && found < perPage)) {
			throw new Error(`highland: page ${page} of ${pages} came with ${found} companies`);
		}
	}

	if (companies.length === 0) {
		throw new Error('highland: no companies on the companies page');
	}

	return companies;
}
