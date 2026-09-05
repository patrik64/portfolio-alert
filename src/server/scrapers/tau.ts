import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.tauventures.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// astro, rendered on the server: each card states the company in its label,
// the sector it is filed under, and whether it has exited — all as attributes,
// which the page's own filters read.
//
// the cards open the fund's write-up rather than the company's site, and no
// company is linked anywhere on the page.

const CARD = 'class="company-card-desktop';
const NAME = /aria-label="View ([^"]*?) portfolio page"/;
const CATEGORY = /data-category="([^"]*)"/;
const EXITED = /data-exited="([^"]*)"/;

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of html.split(CARD).slice(1)) {
		const head = card.slice(0, 1200);
		const name = (head.match(NAME)?.[1] ?? '').trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({
			name,
			category: [
				(head.match(CATEGORY)?.[1] ?? '').trim(),
				head.match(EXITED)?.[1] === 'true' ? 'Exited' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: ''
		});
	}

	if (companies.length === 0) {
		throw new Error('tau: no companies on the portfolio page');
	}

	return companies;
}
