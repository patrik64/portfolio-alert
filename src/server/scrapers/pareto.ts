import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.pareto.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wix. the portfolio is one gallery of logos, each linked to the company and
// carrying nothing else: no caption, no alt text, and the image is stored
// under a hash rather than a filename. so the company is named by its address,
// which leaves a few reading as one word.
//
// the year, the country and the three EXITED marks beside the logos are
// separate text components that wix places over the page by coordinate, with
// nothing tying one to a company. reading them would mean guessing from
// positions, so the category is left empty instead of filled with a guess.
//
// one tile carries no link at all, and nothing else names it, so it is left
// out.

const TILE = /<a data-testid="gallery-item-click-action-link" href="(https?:\/\/[^"]+)"/g;
// what a company puts in front of its brand to get a free address
const DECORATION = /^(?:hello|with|get|try|use|join|my|the)(?=[a-z]{4,})/;
// a host that is the site's own front door rather than the brand
const DOORWAY = /^(?:www|welcome|app|my)$/;

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

const fromHost = (url: string) => {
	try {
		const parts = new URL(url).hostname.split('.').filter((p) => !DOORWAY.test(p));
		const brand = (parts[0] ?? '').replace(DECORATION, '');
		return brand === brand.toLowerCase()
			? brand.replace(/\b[a-z]/g, (c) => c.toUpperCase())
			: brand;
	} catch {
		return '';
	}
};

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const m of html.matchAll(TILE)) {
		const url = m[1];
		const name = clean(fromHost(url));
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({ name, category: '', url });
	}

	if (companies.length === 0) {
		throw new Error('pareto: no companies in the portfolio gallery');
	}

	return companies;
}
