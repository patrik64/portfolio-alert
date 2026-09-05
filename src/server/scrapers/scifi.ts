import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://scifi.vc/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// hand-written html, one page. each card is a link to the company, its logo
// carries the name as alt text, and a line beneath reads "Defense // Invested
// at Seed" — the sector, then the round the fund came in at, which is trimmed
// to the round itself.
//
// the fund heads the section "Select Portfolio Companies", so what is tracked
// here is the twenty it chooses to show.

const ITEM =
	/<a class="portfolio-card[^"]*" href="([^"]*)"[^>]*>\s*<img[^>]*alt="([^"]*)"[^>]*>\s*<span class="portfolio-meta">([^<]*)<\/span>/g;
const INVESTED_AT = /^invested at\s+/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const m of html.matchAll(ITEM)) {
		const name = clean(m[2]);
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({
			name,
			category: clean(m[3])
				.split('//')
				.map((p) => clean(p).replace(INVESTED_AT, ''))
				.filter(Boolean)
				.join(', '),
			url: m[1]
		});
	}

	if (companies.length === 0) {
		throw new Error('scifi: no companies on the portfolio page');
	}

	return companies;
}
