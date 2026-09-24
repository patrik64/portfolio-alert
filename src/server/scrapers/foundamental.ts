import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.foundamental.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, the whole collection on the one page: every row carries, as
// hidden fields for finsweet's filters, the company's name, its sector and
// market, the stage the fund came in at and a tag — "Exits" for the
// companies the fund is out of — beside the year it came in, the country and
// the logo linking the company's site.

const ITEM = /(?=<div[^>]*role="listitem"[^>]*class="[^"]*\bportfolio_item\b)/;
const field = (name: string) => new RegExp(`fs-cmsfilter-field="${name}"[^>]*>([\\s\\S]*?)<\\/div>`);
const NAME = field('name');
const SECTOR = field('sector');
const MARKET = field('investment-market');
const STAGE = field('investment-stage');
const TAG = field('tag');
const YEAR = /<div>\s*((?:19|20)\d{2})\s*<\/div>/;
const COUNTRY = /class="hide-mobile-portrait"><div>([^<]+)<\/div><\/div>/;
const SITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
const LOGO = /<img\b[^>]*\balt="([^"]+)"/;
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
		const name = clean(item.match(NAME)?.[1] || item.match(LOGO)?.[1] || '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const exited = /^exits?$/i.test(clean(item.match(TAG)?.[1] ?? ''));
		const year = item.match(YEAR)?.[1];
		companies.push({
			name,
			category: [
				tag(item.match(SECTOR)?.[1] ?? ''),
				tag(item.match(STAGE)?.[1] ?? ''),
				year ? `Invested ${year}` : '',
				tag(item.match(COUNTRY)?.[1] ?? ''),
				tag(item.match(MARKET)?.[1] ?? ''),
				exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: unescape(item.match(SITE)?.[1] ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('foundamental: no companies on the portfolio page');
	}

	return companies;
}
