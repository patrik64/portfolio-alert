import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.voyagervc.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MAX_PAGES = 15;

// the webflow portfolio is a finsweet list (fs-list-load="infinite") served ten
// cards per page via ?74e2a246_page=N. each card is a button that opens an
// inline detail panel holding the company site, so the url comes from
// portfolio-info__website rather than the card itself. the sector/stage/region
// filter values ride along as fs-list-field attributes, and an acquired company
// wears a tag--acq badge. one card is a nameless "Stealth" placeholder.

export async function scrape(): Promise<ScrapedCompany[]> {
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (let page = 1; page <= MAX_PAGES; page++) {
		const url = page === 1 ? PAGE_URL : `${PAGE_URL}?74e2a246_page=${page}`;
		const resp = await fetch(url, { headers: { 'User-Agent': UA } });
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${url}: ${resp.status}`);
		}
		const html = await resp.text();

		for (const item of html.split('class="portfolio-list__item w-dyn-item"').slice(1)) {
			const name = (item.match(/class="portfolio-card__title">([^<]*)</)?.[1] ?? '')
				.replace(/\s+/g, ' ')
				.trim();
			// an unannounced investment renders as a bare "Stealth" card
			if (!name || /^stealth$/i.test(name) || seen.has(name)) continue;
			seen.add(name);

			const tags: string[] = [];
			for (const field of ['sector', 'stage', 'location']) {
				const value = item
					.match(new RegExp(`fs-list-field="${field}"[^>]*>([^<]*)<`))?.[1]
					?.trim();
				if (value && !tags.includes(value)) tags.push(value);
			}
			const badge = item.match(/class="portfolio-card__tag tag--[a-z]+">([^<]*)</)?.[1]?.trim();
			if (badge) tags.push(badge.charAt(0) + badge.slice(1).toLowerCase());

			// the panel link is w-dyn-bind-empty (href="#") when no site is on file
			const site = item.match(/<a href="(https?:\/\/[^"]+)"[^>]*class="portfolio-info__website"/)?.[1];
			companies.push({ name, category: tags.join(', '), url: site ?? '' });
		}

		if (!/<a href="\?74e2a246_page=\d+"[^>]*class="w-pagination-next"/.test(html)) break;
	}

	if (companies.length === 0) {
		throw new Error('voyagervc: no companies on the portfolio page');
	}

	return companies;
}
