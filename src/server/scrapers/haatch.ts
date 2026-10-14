import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://haatch.com/portfolio';
const MAX_PAGES = 20;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio is a grid of logos, a hundred a page
// (?c9869cbe_page=2), a logo a company, carrying for the page's filters
// its sector ("Fintech", "Applied AI") and the fund it was backed from —
// "Pre-seed SEIS", "Seed EIS", "Angel", "ESAIF" — or what became of it,
// "Exited" or "Retired". a logo opens a panel giving the company's name,
// the year it was founded and the year the fund invested, and links to its
// linkedin and its site. the sector, the fund and the years are kept as
// tags, an exit with the Exited tag and a retired company with the Closed
// tag. every page of the grid must load.

const ITEM = /(?=<div\b[^>]*role="listitem" class="filter-list__item cc-portfolio w-dyn-item")/;
const NAME = /^<div\b[^>]*\bdata-name="([^"]*)"/;
const SECTOR = /data-filter-sector="([^"]*)"/g;
const STAGE = /data-filter-stage="([^"]*)"/g;
// a year under its label in the panel: "Founded", "Invested"
const YEAR = (label: string) =>
	new RegExp(`<div class="eyebrow">${label}</div></div><div\\b[^>]*class="heading-component"><h5>\\s*((?:19|20)\\d{2})`);
const LINK = /<a\b[^>]*\bhref="([^"]*)"[^>]*class="team-social w-inline-block"/g;
const SOCIAL = /^https?:\/\/(?:[\w-]+\.)*(?:linkedin\.com|twitter\.com|x\.com|facebook\.com|instagram\.com|youtube\.com)(?:[/?#]|$)/i;
const NEXT = /href="(\?\w+_page=\d+)" aria-label="Next Page"/;
// the pager after the grid, where the last logo's panel ends
const PAGER = 'role="navigation" aria-label="List"';
const EXITED = /^exited$/i;
const RETIRED = /^retired$/i;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
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
	// the whole grid, a page at a time; a part of it must not pass for the whole
	const items: string[] = [];
	for (let path: string | undefined = '', page = 0; path !== undefined && page < MAX_PAGES; page++) {
		const url: string = `${PAGE_URL}${path}`;
		const resp: Response = await fetch(url, { headers: { 'User-Agent': UA } });
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${url}: ${resp.status}`);
		}
		const html: string = await resp.text();
		const end = html.indexOf(PAGER);
		items.push(...(end < 0 ? html : html.slice(0, end)).split(ITEM).slice(1));
		path = html.match(NEXT)?.[1];
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of items) {
		const name = clean(item.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const stages = [...item.matchAll(STAGE)].map(([, stage]) => tag(stage));
		const founded = item.match(YEAR('Founded'))?.[1];
		const invested = item.match(YEAR('Invested'))?.[1];
		const site =
			[...item.matchAll(LINK)].map(([, href]) => unescape(href).trim()).find((href) => /^https?:\/\//i.test(href) && !SOCIAL.test(href)) ??
			'';
		companies.push({
			name,
			category: [
				...[...item.matchAll(SECTOR)].map(([, sector]) => tag(sector)),
				...stages.filter((stage) => !EXITED.test(stage) && !RETIRED.test(stage)),
				founded ? `Founded ${founded}` : '',
				invested ? `Invested ${invested}` : '',
				stages.some((stage) => EXITED.test(stage)) ? 'Exited' : '',
				stages.some((stage) => RETIRED.test(stage)) ? 'Closed' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: site || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('haatch: no companies in the portfolio grid — the markup moved');
	}

	return companies;
}
