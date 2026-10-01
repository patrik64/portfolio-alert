import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.ainventures.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio page is a grid of cards, each naming the company
// over a line about it and linking its site, or nothing on a few, with the
// fields the filters read hidden beside it: the sector ("Space Tech", "AI/ML
// Dev Tools") and whether it is in the fund's portfolio or its syndicate's,
// or both. the sector is kept as a tag, and "Syndicate Portfolio" too;
// "Fund Portfolio", which nearly every card carries, is not. nothing marks
// an exit.

const ITEM = /(?=<div\b[^>]*\brole="listitem"[^>]*>\s*<a\b[^>]*\bclass="portfolio_item\b)/;
const LINK = /<a\b[^>]*\bhref="([^"]*)"[^>]*\bclass="portfolio_item\b/;
const NAME = /<h3\b[^>]*\bclass="portfolio_title"[^>]*>([\s\S]*?)<\/h3>/;
const SECTOR = /fs-list-field="portfolio-sector"[^>]*>([\s\S]*?)<\/div>/;
const TYPE = /fs-list-field="portfolio-type"[^>]*>([\s\S]*?)<\/div>/g;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const chunk of html.split(ITEM).slice(1)) {
		// a card and the hidden fields after it; the last runs on to the page's end
		const item = chunk.slice(0, 6000);
		const name = clean(item.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const types = [...item.matchAll(TYPE)].map(([, type]) => tag(type));
		const site = unescape(item.match(LINK)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [
				tag(item.match(SECTOR)?.[1] ?? ''),
				types.some((t) => /^syndicate portfolio$/i.test(t)) ? 'Syndicate Portfolio' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('ainventures: no companies on the portfolio page');
	}

	return companies;
}
