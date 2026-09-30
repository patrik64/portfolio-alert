import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://axialvc.com/companies/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// github pages: the companies page is a plain list, a company a line, each
// linking its site, with how the fund got out written after the name in
// brackets — "(Acquired)", "(IPO)". the page's head carries a long html
// comment, so comments are dropped and only the main column is read.

const COMMENT = /<!--[\s\S]*?-->/g;
const MAIN = /<div\b[^>]*\bid="main"[^>]*>([\s\S]*?)(?:<div\b[^>]*\bclass="wrapper-footer"|$)/;
const ROW = /<p>\s*<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>\s*<\/p>/g;
const OUTCOME = /\s*\(\s*((?:acquired|ipo|merged|public|exited)\b[^)]*)\)\s*$/i;
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
	const main = (await resp.text()).replace(COMMENT, '').match(MAIN)?.[1] ?? '';

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, href, text] of main.matchAll(ROW)) {
		const written = clean(text);
		const went = written.match(OUTCOME)?.[1] ?? '';
		const name = written.replace(OUTCOME, '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const site = unescape(href).trim();
		companies.push({
			name,
			category: went ? [tag(went.replace(/^ipo\b/i, 'IPO')), 'Exited'].join(', ') : '',
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('axial: no companies on the companies page');
	}

	return companies;
}
