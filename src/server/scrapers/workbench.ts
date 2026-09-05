import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.work-bench.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// static webflow: the portfolio is one finsweet list with every card rendered
// into the html at once (the filters are client-side and the list carries no
// pagination). each card is an anchor straight to the company site, naming the
// company and its sector and status in fs-list-field cells — "Exit" for the
// companies that have left the portfolio. four cards read "Stealth" and link
// nowhere: they are unannounced investments naming no company, so they are
// skipped rather than collapsed into one.

const CARD = /<a href="([^"]*)"[^>]*class="portfolio_card is-list[^"]*"[^>]*>([\s\S]*?)<\/a>/g;

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, url, card] of html.matchAll(CARD)) {
		const name = (card.match(/fs-list-field="name">([^<]*)</)?.[1] ?? '').trim();
		if (!name || /^stealth$/i.test(name) || seen.has(name)) continue;
		seen.add(name);
		const sector = (card.match(/fs-list-field="category"[^>]*>([^<]*)</)?.[1] ?? '').trim();
		const status = (card.match(/fs-list-field="status"[^>]*>([^<]*)</)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [sector, /^exit/i.test(status) ? 'Exited' : ''].filter(Boolean).join(', '),
			url: /^https?:\/\//.test(url) ? url : ''
		});
	}

	if (companies.length === 0) {
		throw new Error('workbench: no companies on the portfolio page');
	}

	return companies;
}
