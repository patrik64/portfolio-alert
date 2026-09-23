import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://human.capital/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio is a collection list of names, each a link to the
// company's site — or, for a company acquired, to the part of the buyer it
// became, as able's goes to moody's. a couple link nowhere ("#") and keep no
// address. the fund files nobody under a sector and marks no exits.

const ITEM = /(?=<div[^>]*role="listitem"[^>]*class="[^"]*portfolio-company)/;
const NAME = /<h2[^>]*>([\s\S]*?)<\/h2>/;
const SITE = /href="(https?:\/\/[^"]+)"/;

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
	for (const item of html.split(ITEM).slice(1)) {
		const name = clean(item.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: '', url: unescape(item.match(SITE)?.[1] ?? '') });
	}

	if (companies.length === 0) {
		throw new Error('humancapital: no companies on the portfolio page');
	}

	return companies;
}
