import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.noemisventures.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace, the whole portfolio in two galleries of logos. every logo is
// captioned with the company's name, so nothing has to be taken off the
// artwork, and most are linked to the company.
//
// the fund writes those names in capitals — SQUIRE, PETALCARD — and the page
// prints them as typed rather than drawing them that way, so the capitals are
// what a reader sees and they are kept. lowering them would be a guess at
// where the fund's own capitals belong, and GITLINKS and WRKPRTY are not words
// to guess at.
//
// the two galleries are the fund's Pilot Fund and Fund I, which are its own
// vehicles rather than anything about a company, so they are left out the way
// vehicles are elsewhere — and the fund files a company under nothing else, so
// none of them keeps a category.
//
// eight companies are captioned but not linked, and two are linked to the news
// of their acquisition rather than to a site. both are what the fund publishes,
// so an unlinked company keeps no address and a linked one keeps what it is
// given.

const SLIDE = /<div class="slide" data-type="image"[\s\S]*?(?=<div class="slide" data-type="image"|<\/div><\/div><\/div>)/g;
const TITLE = /class="image-slide-title"[^>]*>([\s\S]*?)<\/div>/;
// the fund's markup breaks the anchor over several lines, so the href is found
// anywhere inside the tag rather than straight after it
const LINK = /<a\b[^>]*?\bhref="([^"]*)"/;
const ALT = /class="thumb-image"[^>]*?\balt="([^"]*)"/;

const un = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => un(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const slide of html.match(SLIDE) ?? []) {
		const name = clean(slide.match(TITLE)?.[1] ?? '') || clean(slide.match(ALT)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({ name, category: '', url: clean(slide.match(LINK)?.[1] ?? '') });
	}

	if (companies.length === 0) {
		throw new Error('noemis: no companies in the portfolio');
	}

	return companies;
}
