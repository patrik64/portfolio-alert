import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.inflect.health/capital';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, the portfolio laid out by hand as a table: a header row, then one
// row per company, each a link to the company's own site holding its name, its
// founder and a sentence about what it does. the fund files nobody under a
// sector and marks no exits, so there is no category to record.

const ROW = /<a\s[^>]*class="[^"]*\bportfoliodiv\b[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
const SITE = /href="(https?:\/\/[^"]+)"/;
const NAME = /class="portfolio-name"[^>]*>([\s\S]*?)<\//;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const row of html.matchAll(ROW)) {
		const name = clean(row[1].match(NAME)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: '', url: row[0].match(SITE)?.[1] ?? '' });
	}

	if (companies.length === 0) {
		throw new Error('inflecthealth: no companies in the portfolio table');
	}

	return companies;
}
