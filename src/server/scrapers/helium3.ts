import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.helium-3ventures.com/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, the portfolio on the front page as cards that flip: the front shows
// the logo, the back names the company, says what it does, and gives the month
// of the fund's first investment ("January 2022"); an arrow in the corner links
// the company's site. the category is the year of that first investment.

const CARD = /(?=<div[^>]*class="portfolio-item")/;
const NAME = /class="company-name-text">([\s\S]*?)<\/div>/;
const LINK = /<a\b[^>]*portfolio-link-block[^>]*>/;
const HREF = /href="(https?:\/\/[^"]+)"/;
const INVESTED = /First Investment:\s*<\/div>\s*<div>([\s\S]*?)<\/div>/;

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
	for (const card of html.split(CARD).slice(1)) {
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const year = clean(card.match(INVESTED)?.[1] ?? '').match(/\b(\d{4})\b/)?.[1];
		companies.push({
			name,
			category: year ? `Invested ${year}` : '',
			url: unescape(card.match(LINK)?.[0].match(HREF)?.[1] ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('helium3: no companies in the portfolio cards');
	}

	return companies;
}
