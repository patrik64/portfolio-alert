import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.wxrfund.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const decode = (s: string) =>
	s
		.replace(/&amp;/g, '&')
		.replace(/&#x27;|&#39;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/\s+/g, ' ')
		.trim();

// the page is a squarespace summary gallery: every company is a summary-item
// with the name in data-title and the company site in data-click-through-url.
// the items carry long descriptions but no category tags.

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(/class="\s*summary-item\s/).slice(1)) {
		const name = decode(item.match(/data-title="([^"]*)"/)?.[1] ?? '');
		if (!name || seen.has(name)) continue;
		seen.add(name);
		const url =
			item.match(/data-click-through-url="(https?:\/\/[^"]+)"/)?.[1] ??
			item.match(/href="(https?:\/\/[^"]+)"/)?.[1] ??
			'';
		companies.push({ name, category: '', url });
	}

	if (companies.length === 0) {
		throw new Error('wxrfund: no companies on the portfolio page');
	}

	return companies;
}
