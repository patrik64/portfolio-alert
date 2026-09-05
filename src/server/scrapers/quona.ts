import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://quona.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, the whole grid server-rendered into the page. each card carries a
// greyscale logo and a colour one that swaps in on hover, both with the
// company's name as their alt text, and a link to the company's own site.
//
// the page weighs fourteen megabytes, nearly all of it one decorative inline
// svg of the world; the portfolio itself is a few hundred kilobytes of it.
//
// the fund also draws three regional maps whose side panels list companies by
// continent. those lists are stale — they still name azimo, indiamart and
// zoona, long since exited, and miss two dozen of the grid's newer holdings —
// so the grid alone is the portfolio, and region is not recorded.
//
// what a card says besides the name is a sentence ("insurtech targeting
// clients with chronic diseases"), which is prose rather than a tag, so no
// category.

const BLOCK = '<div class="cpBlock"';
const NAME = /class="cpHeader-logo[^"]*">\s*<img[^>]*alt="([^"]*)"/;
const SITE = /class="ourImpactHome-link cptBl3">\s*<a href="(https?:\/\/[^"]+)"/;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const block of html.split(BLOCK).slice(1)) {
		const name = unescape(block.match(NAME)?.[1] ?? '').trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({
			name,
			category: '',
			url: block.match(SITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('quona: no companies on the portfolio page');
	}

	return companies;
}
