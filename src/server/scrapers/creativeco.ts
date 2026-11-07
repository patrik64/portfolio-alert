import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.creative.co/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the page's table lists every company, a row linking the company's
// site with its name, its market ("Accounting"), its status ("Active",
// "Exited") and a line about it, and a hidden field naming the theme the
// page's filter sorts it under ("AI for vertical markets"). the logo
// carousels above it name no one. the market and theme are kept as tags, an
// exit with the Exited tag.

const ROW = /(?=<div\b[^>]*\brole="listitem")/;
const NAME = /<h3\b[^>]*class="our-portfolio_h3"[^>]*>([\s\S]*?)<\/h3>/;
const MARKET = /class="our-portfolio_table-p"[^>]*>([\s\S]*?)<\/div>/;
const STATUS = /class="our-portfolio_tag\b[^"]*"[^>]*>([\s\S]*?)<\/div>/;
const THEME = /fs-list-field="industry"[^>]*>([\s\S]*?)<\/div>/;
const SITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
const EXITED = /^exit(?:ed)?$/i;
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
	for (const row of html.split(ROW).slice(1)) {
		const name = clean(row.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			category: [
				tag(row.match(MARKET)?.[1] ?? ''),
				tag(row.match(THEME)?.[1] ?? ''),
				EXITED.test(clean(row.match(STATUS)?.[1] ?? '')) ? 'Exited' : ''
			]
				.filter((t, k, all) => t && all.indexOf(t) === k)
				.join(', '),
			url: unescape(row.match(SITE)?.[1] ?? '').trim() || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('creativeco: no companies in the portfolio table — the markup moved');
	}

	return companies;
}
