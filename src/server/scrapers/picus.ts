import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.picuscap.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress on the fund's own theme. the portfolio is a honeycomb of tiles,
// all of them in the page: the filters above it are facetwp, which narrows
// what is already there rather than fetching more, so there is nothing to page
// through.
//
// a tile carries the company's name, a line about it and a link. the fund
// marks two things on the tile itself and nothing else — a unicorn badge and
// an exit ribbon — and those are the whole category. the country, industry and
// first-investment facets are filled in by facetwp over ajax and are not in
// the page, so they are not read.
//
// the last tile is the fund's own "... and more." placeholder, with no company
// behind it.

const TILE = /class="hex[ "]/g;
const NAME = /<p id="demo1">([^<]*)<\/p>/;
const SITE = /<a href="([^"]*)"[^>]*class="portfolio-link-icon"/;
const UNICORN = /class="unicorn-label"/;
const EXITED = /<div class="exit">/;
// the tile that closes the honeycomb rather than naming a company
const FILLER = /^[.…\s]*and\s+(?:many\s+)?more\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#8230;/g, '…')
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

	const starts = [...html.matchAll(TILE)].map((m) => m.index);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [i, at] of starts.entries()) {
		const tile = html.slice(at, starts[i + 1] ?? html.length);

		const name = clean(tile.match(NAME)?.[1] ?? '');
		if (!name || FILLER.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({
			name,
			category: [UNICORN.test(tile) ? 'Unicorn' : '', EXITED.test(tile) ? 'Exit' : '']
				.filter(Boolean)
				.join(', '),
			url: clean(tile.match(SITE)?.[1] ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('picus: no companies on the portfolio page');
	}

	return companies;
}
