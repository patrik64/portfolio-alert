import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.nuwacapital.io/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, the whole portfolio served — no paging, and the industry buttons
// above the grid filter it in the browser.
//
// a card names the company twice: once over the founders' photographs, linked
// to the company, and again inside the panel that opens on it. the linked one
// is read, since it carries the address with it. eight companies are linked to
// "#" — the fund publishes no address for them — and keep none.
//
// what the fund files a company under is on the panel: the stage it came in
// at, and one or more industries. both are read, in that order. the fund
// records nothing about a company having gone, so nothing is tagged as an
// exit.

const ITEM = 'class="portfolio-item w-dyn-item"';
const TITLE = /class="portfolio-card-title"><a href="([^"]*)"[^>]*>\s*<h2[^>]*>([\s\S]*?)<\/h2>/;
// the name inside the panel, for a company the fund has not linked
const PANEL = /class="portfolio-card-info">[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>/;
const STAGE = /class="stage"><div class="portfolio-tag"><h2[^>]*>([\s\S]*?)<\/h2>/;
const INDUSTRY = /class="industry"><div class="portfolio-tag"><h2[^>]*>([\s\S]*?)<\/h2>/g;

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

// the category is comma-joined, so an industry written with a comma in it
// would read as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const items = html.split(ITEM).slice(1);
	if (items.length === 0) {
		throw new Error('nuwa: the portfolio is no longer written into the page');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of items) {
		const linked = item.match(TITLE);
		const name = clean(linked?.[2] ?? item.match(PANEL)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const site = clean(linked?.[1] ?? '');
		companies.push({
			name,
			category: [
				tag(item.match(STAGE)?.[1] ?? ''),
				...[...item.matchAll(INDUSTRY)].map((match) => tag(match[1]))
			]
				.filter(Boolean)
				.join(', '),
			url: site === '#' ? '' : site
		});
	}

	if (companies.length === 0) {
		throw new Error('nuwa: no companies in the portfolio');
	}

	return companies;
}
