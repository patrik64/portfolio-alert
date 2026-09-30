import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.betterventures.io/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio page is a wall of cards served whole — a logo
// linking the company's site and named in its alt text, a line about the
// company, the sustainable development goals it serves as icons, and the
// sectors the filters read as tags ("Climate", "Circularity"). the
// co-investors below the wall are not companies. nothing marks an exit.

const CARD = /(?=<div\b[^>]*\bclass="portfolio-card w-dyn-item")/;
const SITE = /<a\b[^>]*\bhref="([^"]*)"[^>]*\bclass="logo-link\b/;
const NAME = /<img\b[^>]*\balt="([^"]*)"[^>]*\bclass="image-9"/;
const TAG = /\bclass="tag"[^>]*>([\s\S]*?)<\/a>/g;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

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
	for (const card of html.split(CARD).slice(1)) {
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const site = unescape(card.match(SITE)?.[1] ?? '').trim();
		companies.push({
			name,
			// "All" is the filter that shows everything, not a sector
			category: [...card.matchAll(TAG)]
				.map(([, label]) => tag(label))
				.filter((t, i, all) => t && !/^all$/i.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('betterventures: no companies on the portfolio page');
	}

	return companies;
}
