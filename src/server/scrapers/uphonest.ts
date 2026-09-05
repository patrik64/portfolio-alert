import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.uphonestcapital.com/portfolios';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MAX_PAGES = 30;

// the page carries two webflow lists. the one that catches the eye is a grid
// of 55 companies with cover videos, and it is not the portfolio — the
// portfolio is the accordion beneath it, alphabetical, 25 to a page behind
// ?df5d1b27_page=N, and four times longer.
//
// an accordion row names the company, tags it with a sector, and links its
// site from the first of three icons; the other two are socials the row hides
// when it has none, leaving them pointing at "#". a handful of companies have
// the fund's link pointing at their linkedin or twitter instead of a site of
// their own — that is what the fund published, so that is what is kept.
//
// "Others" is the bucket for a company none of the three named sectors fits,
// and says nothing, so it becomes no tag at all.

const ROW = 'class="fpl-accordion w-dyn-item"';
const NAME = /class="fpl-title[^"]*">([^<]*)</;
const SECTOR = /class="filter-button on-fpl[^"]*">([^<]*)</;
const SITE = /<a href="(https?:\/\/[^"]+)"[^>]*class="icon-link w-inline-block"/;

export async function scrape(): Promise<ScrapedCompany[]> {
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();

	for (let page = 1; page <= MAX_PAGES; page++) {
		const url = page === 1 ? PAGE_URL : `${PAGE_URL}?df5d1b27_page=${page}`;
		const resp = await fetch(url, { headers: { 'User-Agent': UA } });
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${url}: ${resp.status}`);
		}
		const html = await resp.text();

		const rows = html.split(ROW).slice(1);
		// the last page still renders the pagination wrapper, so an empty one ends it
		if (rows.length === 0) break;

		for (const row of rows) {
			const name = (row.match(NAME)?.[1] ?? '').trim();
			if (!name || seen.has(name)) continue;
			seen.add(name);
			const sector = (row.match(SECTOR)?.[1] ?? '').trim();
			companies.push({
				name,
				category: /^others?$/i.test(sector) ? '' : sector,
				// the class ends at the quote, so the hidden icons — which carry
				// w-condition-invisible and href="#" — never match
				url: row.match(SITE)?.[1] ?? ''
			});
		}
	}

	if (companies.length === 0) {
		throw new Error('uphonest: no companies in the portfolio list');
	}

	return companies;
}
