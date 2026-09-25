import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.fika.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, the whole collection on the one page: every item names the
// company, links its site from the logo and carries, as slugs for the page's
// filter, the sectors the fund files it under ("b2b-software"); the filter's
// own buttons spell those out ("B2B Software"). the page marks no exits.

const ITEM = /(?=<div[^>]*role="listitem"[^>]*class="[^"]*\bportfolio_item\b)/;
const NAME = /class="portfolio_item_name"[^>]*>([\s\S]*?)<\/h\d>/;
const SITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*class="[^"]*\bportfolio_item_logo-link\b/;
const SLUG = /class="item-filter-slug[^"]*"[^>]*>([^<]*)</g;
const LABEL = /<a\b[^>]*\bdata-slug="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
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

// "b2b-software" -> "B2b Software", for a slug the filter has no button for
const titled = (slug: string) =>
	slug
		.split('-')
		.filter(Boolean)
		.map((word) => word[0].toUpperCase() + word.slice(1))
		.join(' ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const labels = new Map([...html.matchAll(LABEL)].map(([, slug, label]) => [slug, tag(label)]));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const name = clean(item.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			category: [...item.matchAll(SLUG)]
				.map(([, slug]) => clean(slug))
				.filter((slug) => slug && slug !== 'all')
				.map((slug) => labels.get(slug) || titled(slug))
				.filter((t, i, all) => all.indexOf(t) === i)
				.join(', '),
			url: unescape(item.match(SITE)?.[1] ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('fika: no companies on the portfolio page');
	}

	return companies;
}
