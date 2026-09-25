import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.firstcheck.africa/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, the whole collection on the one page: every company is a card
// carrying its name (hidden, for the popup), its sector and, as fields for
// finsweet's filters, its country and the stage the fund came in at; the
// card's popup writes the site out under "Website". the page marks no exits.

const ITEM = /(?=<div[^>]*class="[^"]*\binvestments-clw__item\b(?![-_])[^"]*")/;
const NAME = /class="investments-clw__item-company[^"]*"[^>]*>([\s\S]*?)<\/div>/;
const field = (name: string) =>
	new RegExp(`fs-cmsfilter-field="${name}"[^>]*>([\\s\\S]*?)<\\/div>`);
const COUNTRY = field('Country');
const SECTOR = field('Sector');
const STAGE = field('Stage');
const SITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*class="investments-clw__pop-up-category-item"/;
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
	for (const item of html.split(ITEM).slice(1)) {
		const name = clean(item.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			category: [
				tag(item.match(SECTOR)?.[1] ?? ''),
				tag(item.match(STAGE)?.[1] ?? ''),
				tag(item.match(COUNTRY)?.[1] ?? '')
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: unescape(item.match(SITE)?.[1] ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('firstcheck: no companies on the portfolio page');
	}

	return companies;
}
