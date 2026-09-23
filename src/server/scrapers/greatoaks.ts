import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.greatoaksvc.com/portfolio';
const MAX_PAGES = 20;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio is a grid of logo cards, a hundred to a page, which
// finsweet loads one under another as the page scrolls; the pages are walked
// here through webflow's own "next" links. each card names the company,
// links its site — or its crunchbase entry, for many of the companies sold —
// and carries the one filter the fund files it under: a sector, or "Exits"
// for the companies it is out of. the logo marquees above the grid repeat
// companies from it and are not read.

const CARD = /(?=<div[^>]*role="listitem"[^>]*class="[^"]*\bcompany-logo-item\b)/;
const NAME = /<h3\b[^>]*>([\s\S]*?)<\/h3>/;
const LOGO = /<img\b[^>]*\balt="([^"]+)"/;
const SITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
const CATEGORY = /fs-cmsfilter-field="category"[^>]*>([\s\S]*?)<\/div>/;
const NEXT = /href="(\?[a-z0-9_]+_page=\d+)"[^>]*class="[^"]*w-pagination-next/;
const EXITS = /^exits?$/i;
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
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();

	let url = PAGE_URL;
	for (let page = 0; page < MAX_PAGES && url; page++) {
		const resp = await fetch(url, { headers: { 'User-Agent': UA } });
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${url}: ${resp.status}`);
		}
		const html = await resp.text();

		for (const card of html.split(CARD).slice(1)) {
			const name = clean(card.match(NAME)?.[1] || card.match(LOGO)?.[1] || '');
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			const category = tag(card.match(CATEGORY)?.[1] ?? '');
			companies.push({
				name,
				category: EXITS.test(category) ? 'Exited' : category,
				url: unescape(card.match(SITE)?.[1] ?? '')
			});
		}

		const next = html.match(NEXT)?.[1];
		url = next ? `${PAGE_URL}${unescape(next)}` : '';
	}

	if (companies.length === 0) {
		throw new Error('greatoaks: no companies in the portfolio grid');
	}

	return companies;
}
