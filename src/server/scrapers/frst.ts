import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.frst.vc/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, the portfolio a collection on the home page: every company is a
// logo, its alt text naming it, linking its site behind a line about it, and
// under it the stage the company has reached — "Seed", "Series A", "Series
// B+" — which is what the page's filter reads.

const ITEM = /(?=<div[^>]*role="listitem"[^>]*class="[^"]*\bportfolio_item\b)/;
const NAME = /<img\b[^>]*\balt="([^"]+)"[^>]*class="[^"]*\bportfolio-logo\b/;
const SITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
const STAGE = /fs-cmsfilter-field="stage"[^>]*>([\s\S]*?)<\/div>/;
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
			category: tag(item.match(STAGE)?.[1] ?? ''),
			url: unescape(item.match(SITE)?.[1] ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('frst: no portfolio companies on the home page');
	}

	return companies;
}
