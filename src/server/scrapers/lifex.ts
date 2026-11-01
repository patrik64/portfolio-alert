import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://lifex.vc/founders';
const MAX_PAGES = 10;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the page is three grids of cards — "Current portfolio", and the
// previous portfolios of two of the partners, their record before the fund and
// left out. a card is a company's logo, named by its alt text, a line about it
// that often closes on where it is ("(Bay Area)"), a link to its site and, for
// one the fund is out of, a note of how it went ("Acq: Apple"). the current
// grid shows fifty-five at a time; "see more" asks the same page for the next
// ones, under a query named after the grid, which is read from the link rather
// than assumed.

const GRID = 'id="foundersListPrimary"';
const NEXT_GRID = /\bid="foundersList/;
const NEXT = /\bhref="(\?[a-z0-9]+_page=\d+)"[^>]*\bw-pagination-next/;
const CARD = /(?=<div\b[^>]*\brole="listitem")/;
const LOGO = /<img\b[^>]*\balt="([^"]*)"/;
const NOTE = /<div class="body-xs\b[^"]*">([^<]*)<\/div>/;
const SITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
const LINE = /<p class="body-s">([\s\S]*?)<\/p>/;
const PLACE = /\(([^()]+)\)\s*$/;
const EXIT = /\b(?:acq|acquired|exit|ipo|nasdaq|nyse)\b/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&');

const clean = (s: string) =>
	unescape(s.replace(/<[^>]*>/g, ' '))
		.replace(/\s+/g, ' ')
		.trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => s.replace(/\s*,\s*/g, ' / ');

// "Acq: Apple" -> "Acquired by Apple"
const noteOf = (s: string) => tag(clean(s)).replace(/^acq:\s*/i, 'Acquired by ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let query = '';
	for (let page = 0; page < MAX_PAGES; page++) {
		const url = `${PAGE_URL}${query}`;
		const resp = await fetch(url, { headers: { 'User-Agent': UA } });
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${url}: ${resp.status}`);
		}
		const grid = (await resp.text()).split(GRID)[1]?.split(NEXT_GRID)[0];
		if (!grid) {
			throw new Error('lifex: the current portfolio grid moved');
		}

		for (const card of grid.split(CARD).slice(1)) {
			const name = clean(card.match(LOGO)?.[1] ?? '');
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			const note = noteOf(card.match(NOTE)?.[1] ?? '');
			const place = clean(card.match(LINE)?.[1] ?? '').match(PLACE)?.[1] ?? '';
			companies.push({
				name,
				category: [tag(place), note, EXIT.test(note) ? 'Exited' : ''].filter(Boolean).join(', '),
				url: card.match(SITE)?.[1] ?? ''
			});
		}

		query = grid.match(NEXT)?.[1] ?? '';
		if (!query) break;
		// a last page still pointing onward must not pass for the whole list
		if (page === MAX_PAGES - 1) {
			throw new Error(`lifex: the current portfolio runs past ${MAX_PAGES} pages`);
		}
	}

	if (companies.length === 0) {
		throw new Error('lifex: no companies in the current portfolio');
	}

	return companies;
}
