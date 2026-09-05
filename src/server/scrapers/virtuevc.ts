import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.virtuevc.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// static webflow: each list item renders the company card twice — a linked
// variant and a conditionally-invisible unlinked duplicate — so the name is
// read once per item and the url only from the visible (non-invisible)
// anchor. the site offers one-line descriptions but no tags, so category
// stays ''. a lone "Stealth" placeholder names nothing and is skipped.

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split('class="portfolio_list-item w-dyn-item"').slice(1)) {
		const name = (item.match(/class="portfolio_name">([^<]*)</)?.[1] ?? '').trim();
		if (!name || /^stealth$/i.test(name) || seen.has(name)) continue;
		seen.add(name);
		companies.push({
			name,
			category: '',
			// the class ends at the quote, so the w-condition-invisible variant
			// (and its href="#") never matches
			url:
				item.match(
					/<a href="(https?:\/\/[^"]+)"[^>]*class="portfolio_item-wrapper w-inline-block"/
				)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('virtuevc: no companies on the portfolio page');
	}

	return companies;
}
