import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://riot.vc/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// static webflow, the portfolio a grid on the fund's one page. each card links
// to the company and carries its name twice — in a heading webflow hides
// behind the logo, and in the logo's alt text. the heading is the one read,
// because half the logos were uploaded without alt text.
//
// the fund files nobody under a sector and marks no exits; what a card says
// besides the name is a line about what the company does.

const ITEM = '<div role="listitem" class="portfolio-card w-dyn-item">';
const NAME = /<h3 class="h3 portfolio-card__title[^"]*">([^<]*)<\/h3>/;
const NAME_ALT = /alt="([^"]*)"[^>]*class="portfolio-card__logo"/;
const SITE = /<a href="(https?:\/\/[^"]*)"/;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
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

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const name = clean(item.match(NAME)?.[1] ?? item.match(NAME_ALT)?.[1] ?? '');
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({ name, category: '', url: item.match(SITE)?.[1] ?? '' });
	}

	if (companies.length === 0) {
		throw new Error('riot: no companies on the portfolio page');
	}

	return companies;
}
