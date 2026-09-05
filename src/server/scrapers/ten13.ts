import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.ten13.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// static webflow, whole list in the html: each card is a link straight to the
// company, naming it in the heading and stating its sector beneath.
//
// the fund marks no exits, so a company's sector is its whole category.

const ITEM = 'class="extrapadding w-dyn-item w-col w-col-6"';
const NAME = /<h1[^>]*class="[^"]*uui-heading-small[^"]*"[^>]*>([^<]*)</;
const SECTOR = /<p[^>]*class="sector"[^>]*>([^<]*)</;
const SITE = /<a href="(https?:\/\/[^"]+)"/;

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
			category: (item.match(SECTOR)?.[1] ?? '').trim(),
			url: item.match(SITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('ten13: no companies on the portfolio page');
	}

	return companies;
}
