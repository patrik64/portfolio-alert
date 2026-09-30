import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.cake.vc/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the companies page is one list, each company a card with its
// name that opens an overlay — its status ("Active"), its site, the
// categories it is filed under ("Aging", "Women", "B2B"), its numbers,
// founders and where it is. the filter and sort run in the browser, so the
// page holds every company. a status other than "Active" that says the
// company was sold or went public marks an exit.

const ITEM = /(?=<div\b[^>]*\bclass="companies-list_overlay-item w-dyn-item")/;
const NAME = /class="companies-list_item-name"[^>]*>([\s\S]*?)<\/h3>/;
const STATUS = /class="companies-list_overlay-status\b[^"]*"[^>]*>([\s\S]*?)<\/div>/;
const SITE = /<a\b[^>]*\bhref="([^"]*)"[^>]*\bclass="companies-list_overlay-link\b/;
const CATEGORY = /class="companies-list_overlay-category-text"[^>]*>([\s\S]*?)<\/div>/g;
const PLACE = />\s*Location\s*<\/div>\s*<div\b[^>]*>([\s\S]*?)<\/div>/;
const EXITS = /\b(acquired|exit|ipo|public|merged)/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a place written "Hoboken, NJ" would read
// as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

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
		const status = tag(item.match(STATUS)?.[1] ?? '');
		const exited = EXITS.test(status);
		const site = unescape(item.match(SITE)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [
				...[...item.matchAll(CATEGORY)].map(([, category]) => tag(category)),
				tag(item.match(PLACE)?.[1] ?? ''),
				exited ? status : '',
				exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('cake: no companies on the companies page');
	}

	return companies;
}
