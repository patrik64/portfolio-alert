import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.backingminds.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// framer, since october 2026 (squarespace before): the portfolio page is a
// grid of cards, each drawn twice for the page's layouts, a card a logo, the
// company's name as its heading and a line about it, linking a page of the
// company's here. those pages are empty shells, without a word or a link,
// so a company is linked to the grid. the site no longer sets the companies
// the fund is out of apart from the rest, so none is marked exited.

const CARD = /<a\b[^>]*\bhref="\.\/([^"/#?]+)"[^>]*>([\s\S]*?)<\/a>/g;
const HEADING = /<h3\b[^>]*>([\s\S]*?)<\/h3>/;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	// the menu's links carry no heading, and are passed over
	for (const [, , card] of html.matchAll(CARD)) {
		const name = clean(card.match(HEADING)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: '', url: PAGE_URL });
	}

	if (companies.length === 0) {
		throw new Error('backingminds: no company cards in the portfolio grid — the markup moved');
	}

	return companies;
}
