import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.ambition.capital/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// static webflow: one grid of cards, each an anchor to the company's site
// naming the company and what it builds. the carousel above the grid features
// four of the same companies, so only the grid is read.
//
// the site publishes no sectors or stages — what it gives instead is a short
// technology label per company ("Advanced radar", "Global IOT Network"), which
// serves as the category. a label's own commas would split it into tags that
// name nothing, so they fold into slashes.

const CARD =
	/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*class="portfolio_card[^"]*"[^>]*>([\s\S]*?)<\/a>/g;

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, url, card] of html.matchAll(CARD)) {
		const name = (card.match(/<h3 class="text-size-large[^"]*">([^<]*)<\/h3>/)?.[1] ?? '').trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);
		const label = (
			card.match(/<div class="heading-style-h5 text-weight-xlight">([^<]*)<\/div>/)?.[1] ?? ''
		).trim();
		companies.push({
			name,
			category: label.replace(/,\s*(?:and\s+)?/g, ' / '),
			url
		});
	}

	if (companies.length === 0) {
		throw new Error('ambition: no companies on the portfolio page');
	}

	return companies;
}
