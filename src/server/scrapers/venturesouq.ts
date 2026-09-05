import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.venturesouq.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MAX_PAGES = 10;

// the webflow portfolio is a finsweet list (fs-list-load="all") paginated at
// 100 cards per page via ?cc1f65e4_page=N. each card links straight to the
// company site (href="#" when there is none) and carries the name plus
// Fund/Region/Sector fields; an EXITED badge is w-condition-invisible unless
// it applies. two different companies share the name Clara, so cards dedupe
// on name+url rather than name alone.

export async function scrape(): Promise<ScrapedCompany[]> {
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (let page = 1; page <= MAX_PAGES; page++) {
		const url = page === 1 ? PAGE_URL : `${PAGE_URL}?cc1f65e4_page=${page}`;
		const resp = await fetch(url, { headers: { 'User-Agent': UA } });
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${url}: ${resp.status}`);
		}
		const html = await resp.text();

		for (const item of html.split('class="collection-item w-dyn-item').slice(1)) {
			const name = (item.match(/fs-list-field="Name"[^>]*>([^<]*)</)?.[1] ?? '')
				.replace(/\s+/g, ' ')
				.trim();
			const href = item.match(/<a href="([^"]+)"/)?.[1] ?? '';
			const site = /^https?:\/\//.test(href) ? href : '';
			if (!name || seen.has(`${name}|${site}`)) continue;
			seen.add(`${name}|${site}`);

			const tags: string[] = [];
			for (const field of ['Fund', 'Region', 'Sector']) {
				const value = item
					.match(new RegExp(`fs-list-field="${field}"[^>]*>([^<]*)<`))?.[1]
					?.trim();
				// the fund and sector fields often repeat the same label
				if (value && !tags.includes(value)) tags.push(value);
			}
			if (/class="text-block-15">EXITED</.test(item)) tags.push('Exited');

			companies.push({ name, category: tags.join(', '), url: site });
		}

		if (!html.includes('w-pagination-next')) break;
	}

	if (companies.length === 0) {
		throw new Error('venturesouq: no companies on the portfolio page');
	}

	return companies;
}
