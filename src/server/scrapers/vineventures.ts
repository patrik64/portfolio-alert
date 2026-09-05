import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://vineventures.com/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// server-rendered wordpress: the portfolio is a filterable list on the
// homepage, one <li data-tab data-location> row per company with the name in
// the list-title cell, the display sector in the list-tab cell, the region in
// the list-location cell, and the company site in the list-link anchor.
// rows named "StealthCo" are unannounced placeholders (no name, no site) and
// are skipped; a trailing "*" footnotes "Unicorns backed at prior firms" and
// is stripped from the name.

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	for (const row of html.split(/<li data-tab="[^"]*" data-location="[^"]*" class="text-16">/).slice(1)) {
		const name = (
			row.match(/list-title">\s*<div class="">\s*<span>\+<\/span>([^<]*)<\/div>/)?.[1] ?? ''
		)
			.trim()
			.replace(/\*$/, '');
		if (!name || /^stealthco$/i.test(name)) continue;
		const sector = (row.match(/list-tab show-for-large">\s*([^<]*?)\s*<\/div>/)?.[1] ?? '').trim();
		const location = (row.match(/list-location">\s*([^<]*?)\s*<\/div>/)?.[1] ?? '').trim();
		const url = row.match(/list-link text-right">\s*<a href="([^"]*)"/)?.[1] ?? '';
		companies.push({
			name,
			category: [sector, location].filter(Boolean).join(', '),
			url
		});
	}

	if (companies.length === 0) {
		throw new Error('vineventures: no companies on the page');
	}

	return companies;
}
