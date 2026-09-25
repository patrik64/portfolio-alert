import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.digitxpartners.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: every company is a card linking its site, with a logo, the name
// and a line about it. the page files companies under nothing and marks no
// exit.

const ITEM = /(?=<div[^>]*class="portfolio-list-item w-dyn-item)/;
const LINK = /<a\b[^>]*\bhref="([^"]*)"[^>]*class="[^"]*\bportfolio-item-link\b/;
const NAME = /class="portfolio-item-title"[^>]*>([\s\S]*?)<\/(?:div|h\d)>/;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const name = clean(item.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			category: '',
			url: unescape(item.match(LINK)?.[1] ?? '').trim().replace(/^(?=[\w-]+(\.[\w-]+)+)/, 'https://') || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('digitx: no companies on the portfolio page');
	}

	return companies;
}
