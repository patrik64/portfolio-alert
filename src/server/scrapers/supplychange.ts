import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://supplychange.fund/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress and elementor, one page holding the whole site. the portfolio is a
// row of cards that flip: the front shows the logo and a founder, the back the
// company and what it does.
//
// the back of the card is taken rather than the front, because the front's
// markup is shared with the team and founder cards further down the page.
//
// the fund files nobody under a sector and marks no exits, so there is no
// category to record — what a card says besides the name is a sentence.

const CARD = '<div class="portfolio-card">';
const NAME = /<h3>([\s\S]*?)<\/h3>/;
const SITE = /class="portfolio-link">\s*<a href="(https?:\/\/[^"]+)"/;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&#8211;|&ndash;/g, '–')
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) =>
	unescape(s.replace(/<[^>]+>/g, ''))
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
	for (const card of html.split(CARD).slice(1)) {
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({
			name,
			category: '',
			url: card.match(SITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('supplychange: no companies on the portfolio page');
	}

	return companies;
}
