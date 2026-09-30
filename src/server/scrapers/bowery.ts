import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://bowerycap.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// craft cms: the portfolio page is a table served whole, a row a company —
// its logo, named in the alt text ("ActionIQ logo"), a line about it, where
// it is ("NYC", "Bay Area"), and a link to its site. a company the fund is
// out of wears an "Exited" flag on its logo's corner; how it went is only
// in the prose. the filters above the table run through the page's own
// component but the first render holds every row.

const ROW = /(?=<div\b[^>]*\bdata-test="portfolio-result")/;
const NAME = /\balt="([^"]*?)\s+logo"/;
const EXITED = /\balt="Background for exited text"/;
const PLACE = /lg:basis-3\/5">\s*([\s\S]*?)\s*<\/div>/;
const SITE = /<a\b[^>]*?\bhref="([^"]*)"/;
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
	for (const row of html.split(ROW).slice(1)) {
		const name = clean(row.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const site = unescape(row.match(SITE)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [tag(row.match(PLACE)?.[1] ?? ''), EXITED.test(row) ? 'Exited' : ''].filter(Boolean).join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('bowery: no companies on the portfolio page');
	}

	return companies;
}
