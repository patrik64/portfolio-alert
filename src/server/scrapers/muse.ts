import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.musecapital.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow. the page carries each company three times over — once in the
// slider at the top, once as a card in the grid, and once as the panel that
// card opens — and only the panel has everything: the name, what the fund
// files the company under, and where to find it. so the panels are read and
// the other two left alone; the names in the grid are the same thirty-nine.
//
// a panel ends with three links in a fixed order, the company's own first and
// its linkedin and instagram after. two companies have a # in all three, both
// of them sold years ago, and those keep no address rather than being sent to
// the fund's own page, which does not exist for them.

const PANEL = /<div role="listitem" class="portfolio-pop-up-card w-dyn-item">([\s\S]*?)(?=<div role="listitem" class="portfolio-pop-up-card w-dyn-item">|$)/g;
const NAME = /class="portfolio-pop-up-heading">([\s\S]*?)<\/p>/;
// the fund writes these comma-separated, which is how the category is written
const INDUSTRIES = /class="portfolio-industries">([\s\S]*?)<\/p>/;
const SITE = /<a href="([^"]*)"[^>]*class="portfolio-social-link/;

const clean = (s: string) =>
	s
		.replace(/<[^>]+>/g, ' ')
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;|&#8220;|&#8221;/g, '"')
		.replace(/&nbsp;/g, ' ')
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
	for (const [, panel] of html.matchAll(PANEL)) {
		const name = clean(panel.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const site = panel.match(SITE)?.[1] ?? '';
		companies.push({
			name,
			category: clean(panel.match(INDUSTRIES)?.[1] ?? ''),
			url: /^https?:\/\//i.test(site) ? site : ''
		});
	}

	if (companies.length === 0) {
		throw new Error('muse: no companies in the portfolio panels');
	}

	return companies;
}
