import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.nucleus-capital.com';
const PAGE_URL = `${BASE_URL}/`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
// the fund lists twelve at a time; the cap is only so a page that always
// offers another cannot spin here forever
const MAX_PAGES = 30;

// webflow, and the portfolio has no page of its own: the fund's site is one
// page with the companies a section of it, so the front page is what is read.
//
// twelve are served at a time behind a Load more, which webflow writes as a
// link to the next page of the same list. the link is followed until the fund
// stops offering one. which query it uses is not written down here — webflow
// names it after the collection and renames it when the site is rebuilt — so
// the link is taken as the page gives it.
//
// a company is a logo until it is hovered, and everything the fund says about
// it is in the tile behind: the name, a line about what it does, the sector,
// and whether the fund still holds it. it links to the company's own site.
//
// the fund files a company under "Nucleus Portfolio" or "Previous
// Investments". the first is what a company is while it is none of the other,
// so it is dropped; the second is kept in the fund's own words, since it says
// the fund is out rather than how it left.

const ITEM = /<a href="([^"]*)"[^>]*class="investment-item w-inline-block">([\s\S]*?)<\/a>/g;
const NAME = /class="text-size-large">([\s\S]*?)<\/div>/;
const TAG = /fs-cmsfilter-field="[^"]*">([\s\S]*?)<\/div>/g;
const NEXT = /<a href="(\?[^"]*)"[^>]*class="w-pagination-next/;
// what a company is filed under while the fund still holds it
const HELD = /^nucleus portfolio$/i;

const un = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => un(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a sector written with a comma in it would
// read as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

async function fetchPage(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let url = PAGE_URL;

	for (let page = 0; page < MAX_PAGES; page++) {
		const html = await fetchPage(url);

		for (const [, href, tile] of html.matchAll(ITEM)) {
			const name = clean(tile.match(NAME)?.[1] ?? '');
			if (!name || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());

			companies.push({
				name,
				category: [...tile.matchAll(TAG)]
					.map((match) => tag(match[1]))
					.filter((value) => value && !HELD.test(value))
					.join(', '),
				url: clean(href)
			});
		}

		const next = html.match(NEXT)?.[1];
		if (!next) break;
		url = `${BASE_URL}/${clean(next)}`;
	}

	if (companies.length === 0) {
		throw new Error('nucleus: no companies in the portfolio');
	}

	return companies;
}
