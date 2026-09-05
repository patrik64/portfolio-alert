import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.magic.fund/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a page written by hand, with the portfolio in two lists of the same shape:
// the companies the fund puts first and, behind a see-all, the rest of them.
// both are read, since which list a company is in is the fund's own ordering
// rather than anything about the company.
//
// each company is a link out, its name and a line about what it does. the line
// is a sentence rather than a sector, so it is not kept as one; the only thing
// the fund files against a company is where it has gone, which it writes into
// the name in brackets and which comes out of it here, in the fund's own
// wording and its own capitals.
//
// the fund's own people are further down the page under Featured Partners, in
// a list of their own that is left alone.

const LIST = /<ul class="[^"]*\blist-featured\b[^"]*"[^>]*>([\s\S]*?)<\/ul>/g;
const ITEM = /<li>\s*<a\b[^>]*?\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
const NAME = /<h3>([\s\S]*?)<\/h3>/;
// where a company has gone, written into its name
const GONE = /\s*\(([^)]*)\)\s*$/;

const clean = (s: string) =>
	s
		.replace(/<[^>]+>/g, ' ')
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;|&#8220;|&#8221;/g, '"')
		.replace(/&nbsp;| /g, ' ')
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();

	for (const list of html.matchAll(LIST)) {
		for (const item of list[1].matchAll(ITEM)) {
			const said = clean(item[2].match(NAME)?.[1] ?? '');
			if (!said) continue;

			const gone = said.match(GONE);
			const name = gone ? clean(said.slice(0, gone.index)) : said;
			if (!name || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());

			const url = clean(item[1]);
			companies.push({
				name,
				category: gone ? clean(gone[1]) : '',
				url: /^https?:\/\//i.test(url) ? url : ''
			});
		}
	}

	if (companies.length === 0) {
		throw new Error('magic: no companies in the portfolio');
	}

	return companies;
}
