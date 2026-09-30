import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://bbv.io/#startups';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress on the bridge theme: the portfolio is a section of the home
// page, rows of boxes each a logo linking the company's site, the name in
// the logo's alt text and again as a heading, and a line about the company
// that ends in the campus it came out of ("Berkeley MIT"). the fund files
// nothing else about a company and marks no exits.

const BOX = /<div class='box'>\s*<a\b[^>]*\bhref='([^']*)'[^>]*>\s*<img\b[^>]*\balt='([^']*)'[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/g;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, href, alt, heading] of html.matchAll(BOX)) {
		const name = clean(heading) || clean(alt);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const site = unescape(href).trim();
		companies.push({ name, category: '', url: /^https?:\/\//i.test(site) ? site : PAGE_URL });
	}
	if (companies.length === 0) {
		throw new Error('bbv: no companies in the portfolio section');
	}

	return companies;
}
