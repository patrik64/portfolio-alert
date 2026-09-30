import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://carusoventures.com/investments';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next, rendered on the server: the investments page is three grids, each
// under a heading with its count — "Colorado Thesis", the fund's active
// portfolio, "Legacy Portfolio" and "Exited Investments" — every company a
// logo linking its site, named in the logo's alt text and turning over to
// a line about it. the heading is kept as the company's tag, and the
// exited ones are marked so. a company in stealth is counted in the
// heading but drawn nowhere.

const SECTION = /(?=<h2\b)/;
const HEADING = /<h2\b[^>]*>([\s\S]*?)<\/h2>/;
const CARD = /<a\b[^>]*\bhref="([^"]*)"[^>]*>(?:(?!<\/a>)[\s\S])*?<img\b[^>]*\balt="([^"]*)"/g;
const STEALTH = /^stealth\b/i;

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
	for (const section of html.split(SECTION).slice(1)) {
		// "Colorado Thesis 17 companies"
		const heading = clean(section.match(HEADING)?.[1] ?? '').replace(/\s*\d+\s+compan(?:y|ies)\s*$/i, '');
		const exited = /\bexit/i.test(heading);
		for (const [, href, alt] of section.matchAll(CARD)) {
			const name = clean(alt);
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			const site = unescape(href).trim();
			companies.push({
				name,
				category: exited ? 'Exited' : heading,
				url: /^https?:\/\//i.test(site) ? site : PAGE_URL
			});
		}
	}
	if (companies.length === 0) {
		throw new Error('caruso: no companies on the investments page');
	}

	return companies;
}
