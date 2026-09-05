import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.triatomic.ai/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js, server-rendered: the portfolio is a section of the front page, one
// link per company. what names the company is the label written for readers
// who cannot see the card — "Chalk: Real time data platform for AI
// applications" — the company before the colon, what it does after.
//
// the fund publishes no sectors and marks no exits, so categories are empty.

const ANCHOR = /<a[^>]*href="(https?:\/\/[^"]+)"[^>]*aria-label="([^"]*?) \(opens in new tab\)"/g;

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, url, label] of html.matchAll(ANCHOR)) {
		const name = label.split(':')[0].trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({ name, category: '', url });
	}

	if (companies.length === 0) {
		throw new Error('triatomic: no companies on the page');
	}

	return companies;
}
