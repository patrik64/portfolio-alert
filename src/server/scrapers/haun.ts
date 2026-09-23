import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.haun.co/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: one list of the companies the fund may name, each a card linking
// the company's site — or its x account, for one without a site yet — with
// its name over its logo. the cards carry stage and vertical attributes for a
// filter the page has commented out, all of them empty, so a company comes
// with nothing to file it under.

const ITEM = /(?=<div[^>]*role="listitem"[^>]*class="[^"]*home-portfolio-list-item)/;
const NAME = /class="[^"]*\bheading-22px\b[^"]*"[^>]*>([\s\S]*?)<\/div>/;
const SITE = /<a[^>]*href="(https?:\/\/[^"]+)"/;
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
			url: unescape(item.match(SITE)?.[1] ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('haun: no companies on the portfolio page');
	}

	return companies;
}
