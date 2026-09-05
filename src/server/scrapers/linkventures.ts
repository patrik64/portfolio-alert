import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.linkventures.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, the whole collection on the one page, every field labelled for
// the site's own client-side filter: fs-cmsfilter-field="Name" and
// "Category" carry what their names say, and most cards link out to the
// company's own address. the same filter markup also draws the filter
// checkboxes as collection items, so only the cards that name a company
// count. the card's Fund (LV1..LV3, Link-XPV) is a vehicle rather than
// anything about the company, and the year's meaning is nowhere said, so
// neither is kept.

const NAME = /fs-cmsfilter-field="Name"[^>]*>([^<]*)</;
const CATEGORY = /fs-cmsfilter-field="Category"[^>]*>([^<]*)</;
const SITE = /href="(https?:\/\/[^"]+)"/;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a sector holding a comma would read as
// two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(/(?=<div role="listitem")/)) {
		if (!item.startsWith('<div role="listitem"')) continue;
		const name = clean(item.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({
			name,
			category: tag(item.match(CATEGORY)?.[1] ?? ''),
			url: item.match(SITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('linkventures: no companies on the portfolio page');
	}

	return companies;
}
