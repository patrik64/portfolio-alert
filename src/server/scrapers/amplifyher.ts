import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.amplifyherventures.com/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// strikingly: the home page's portfolio is a run of grids, one for each
// focus ("COMMERCE", "CARE", "CONNECTIVITY"), kept as a tag, each company
// a tile with its name, as the fund writes it, in capitals, a line about
// it and a link to its site. the grids' unfilled tiles ("COMING SOON",
// "Add Title") are left out, as are the sections the page hides, among
// them a grid of the fund's mba fellows. nothing marks an exit.

const SECTION = /(?=<li class="slide\b)/;
const HIDDEN = /^<li class="[^"]*\bs-hidden-section\b/;
const GRID = /\bs-grid-section\b/;
const CELL = /(?=<div\b[^>]*\bclass="s-grid-section-cell\b[^"]*\bs-repeatable-item\b)/;
const HEADING = /<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/g;
const LINK = /<a\b[^>]*\bhref="([^"]*)"/;
const TITLE = /\bclass="s-item-title"[^>]*>([\s\S]*?)(?=<div\b[^>]*\bclass="s-item-text"|$)/;
const UNFILLED = /^(?:coming soon|add title)$/i;
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
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const section of html.split(SECTION).slice(1)) {
		if (HIDDEN.test(section) || !GRID.test(section)) continue;
		const [head, ...cells] = section.split(CELL);
		// the focus is the last heading over the grid, "PORTFOLIO" then "COMMERCE"
		const focus = [...head.matchAll(HEADING)].map(([, text]) => tag(text)).filter(Boolean).at(-1) ?? '';
		for (const cell of cells) {
			const name = clean(cell.match(TITLE)?.[1] ?? '');
			if (!name || UNFILLED.test(name) || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			const site = unescape(cell.match(LINK)?.[1] ?? '').trim();
			companies.push({ name, category: focus, url: /^https?:\/\//i.test(site) ? site : PAGE_URL });
		}
	}
	if (companies.length === 0) {
		throw new Error('amplifyher: no companies in the portfolio');
	}

	return companies;
}
