import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.renegadepartners.com/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// static webflow. each card is rendered two or three times over for the sizes
// the layout breaks at, so the sixty cards on the page are twenty-five
// companies; what is read instead is the schema.org block the fund embeds
// beside each card, which appears once per company and names it outright.
//
// the fund files nobody under a sector. what it publishes besides the name and
// the address is the round it came in at and whether it led — and for the one
// company that has left, that it was acquired. that line is the category.
//
// one block is the page's own strapline rather than a company, and it carries
// no address, which is what tells the two apart.

const ORGANIZATION =
	/<div itemscope itemtype="https:\/\/schema\.org\/Organization">\s*<meta itemprop="name" content="([^"]*)">\s*<meta itemprop="url" content="([^"]*)">\s*<meta itemprop="description" content="([^"]*)">/g;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const m of html.matchAll(ORGANIZATION)) {
		const name = clean(m[1]);
		const url = clean(m[2]);
		if (!name || !url || seen.has(name)) continue;
		seen.add(name);
		companies.push({ name, category: clean(m[3]), url });
	}

	if (companies.length === 0) {
		throw new Error('renegade: no companies on the portfolio page');
	}

	return companies;
}
