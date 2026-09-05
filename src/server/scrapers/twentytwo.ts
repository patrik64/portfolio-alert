import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://twentytwo.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace, where the portfolio is an accordion block and the fund has
// packed each company's four facts into the row's title, comma-separated:
// "Airbyte , https://airbyte.com/ , 2020 , Dev Tools". the address is written
// as text rather than linked, so the page holds no outbound links at all.
//
// the year the fund invested is not a category, and is left out; a row that
// does not carry all four fields is not one of these rows.

const TITLE = /class="accordion-item__title">([^<]*)</g;

const ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	'#39': "'"
};
const decode = (s: string) => s.replace(/&(#39|amp|lt|gt|quot);/g, (_, e) => ENTITIES[e] ?? _);

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, title] of html.matchAll(TITLE)) {
		const parts = decode(title)
			.split(',')
			.map((part) => part.trim());
		if (parts.length !== 4) continue;
		const [name, site, , sector] = parts;
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({
			name,
			category: sector,
			url: /^https?:\/\//.test(site) ? site : ''
		});
	}

	if (companies.length === 0) {
		throw new Error('twentytwo: no companies on the portfolio page');
	}

	return companies;
}
