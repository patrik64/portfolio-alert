import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.undeterredcapital.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// static webflow, the whole list in the html. a card names the company, the
// round the fund came in at and what it works on, and links its site.
//
// every card carries an "Acquired" badge; webflow leaves it in the markup and
// hides it with w-condition-invisible for the companies that have not been,
// so the badge counts only where that class is absent.
//
// three cards read "Unannounced" — investments the fund has not named yet.

const CARD = 'class="portfolio-collection-list-item w-dyn-item"';
const NAME = /class="name">([^<]*)</;
const STAGE = /class="portfolio-card-content-top"><div class="text-block">([^<]*)</;
const CATEGORY = /fs-cmsfilter-field="category"[^>]*>([^<]*)</;
const ACQUIRED = /class="portfolio-card-content-top acquired([^"]*)"/;
const SITE = /<a href="(https?:\/\/[^"]+)"[^>]*class="portfolio-card-link/;

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of html.split(CARD).slice(1)) {
		const name = (card.match(NAME)?.[1] ?? '').trim();
		if (!name || /^unannounced$/i.test(name) || seen.has(name)) continue;
		seen.add(name);

		const badge = card.match(ACQUIRED)?.[1];
		const tags = [
			(card.match(CATEGORY)?.[1] ?? '').trim(),
			(card.match(STAGE)?.[1] ?? '').trim(),
			badge !== undefined && !badge.includes('w-condition-invisible') ? 'Acquired' : ''
		].filter(Boolean);

		companies.push({
			name,
			category: tags.join(', '),
			url: card.match(SITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('undeterred: no companies on the portfolio page');
	}

	return companies;
}
