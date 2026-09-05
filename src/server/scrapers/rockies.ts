import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://rockiesventurefund.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a gohighlevel page builder, which renders the portfolio as a run of heading
// blocks in pairs: the company's name, set bold and coloured, then the sector
// it works in, set plain. so a bold heading opens a company and the plain one
// after it says what the company does.
//
// nothing on the page links out — there are no external links at all — so no
// addresses are recorded. the fund marks no exits.

const HEADING = /class="c-sub-heading c-wrapper"[\s\S]*?<h2>([\s\S]*?)<\/h2>/g;
const BOLD = /<strong>/;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) =>
	unescape(s.replace(/<[^>]+>/g, ''))
		.replace(/\s+/g, ' ')
		.trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const headings = [...html.matchAll(HEADING)].map((m) => ({
		text: clean(m[1]),
		isName: BOLD.test(m[1])
	}));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (let i = 0; i < headings.length; i++) {
		const heading = headings[i];
		if (!heading.isName || !heading.text || seen.has(heading.text)) continue;
		seen.add(heading.text);
		const next = headings[i + 1];
		companies.push({
			name: heading.text,
			category: next && !next.isName ? next.text : '',
			url: ''
		});
	}

	if (companies.length === 0) {
		throw new Error('rockies: no companies on the portfolio page');
	}

	return companies;
}
