import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.twelvebelow.co/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// static webflow. each row reads as a sentence — the company, then who founded
// it — so the company is the first link of the row and its founders' profiles
// follow; the row also names the company in that link's data-text.
//
// the same companies appear again as the dots of a star map further down the
// page, which is why the two lists are the same length. the fund publishes no
// sectors or stages, only a line about what each company does, so every
// category comes back empty.

const ITEM = 'class="portfolio-cms-item w-dyn-item"';
const NAME = /data-text="([^"]+)"/;
const SITE = /href="(https?:\/\/[^"]+)"/;

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
			category: '',
			url: item.match(SITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('twelvebelow: no companies on the portfolio page');
	}

	return companies;
}
