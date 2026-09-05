import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://tribecap.co/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// static webflow: one row per company, naming it, the country it works from
// and what it does. the rows are anchors that lead nowhere — every href is
// "#" — so the fund links no company site, and none is reported.
//
// the names are written in capitals and are kept that way. lower-casing them
// would have to guess where the capitals belong again, and this list holds
// OPENAI and SPACEX, which no rule would put back correctly.

const ITEM = 'class="portfolio-page-list w-dyn-item"';
const NAME = /class="outlined-label"[\s\S]{0,300}?<div>\/\/[\s ]*<\/div><div>([^<]*)</;
const COUNTRY = /home-partners_item_country[^>]*>([^<]*)</;

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const name = (item.match(NAME)?.[1] ?? '').trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({
			name,
			category: (item.match(COUNTRY)?.[1] ?? '').trim(),
			url: ''
		});
	}

	if (companies.length === 0) {
		throw new Error('tribecap: no companies on the portfolio page');
	}

	return companies;
}
