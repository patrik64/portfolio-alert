import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://beyondearth.vc/#rec1034299556';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// tilda, the whole site one page: the portfolio is a carousel of cards in
// one block of it — a company a card, with its name, a line about it and
// a button that links not the company's site but a piece on it: a funding
// announcement, a Y Combinator page, a product page. that link is kept,
// being what the fund gives. the fund files nothing else about a company
// and marks no exits.

const CARD = /(?=<div\s+class="t1196__item\s)/;
const NAME = /class="t-card__title[^"]*"[^>]*>([\s\S]*?)<\/div>/;
// the button's tag is written over several lines
const LINK = /<a\s[^>]*?\bclass="t-btntext[^"]*"[^>]*?\bhref="([^"]*)"/;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const chunk of html.split(CARD).slice(1)) {
		// a card ends where its button wrapper closes; the last runs on to the end of the page
		const end = chunk.indexOf('t-card__btn-wrapper');
		const card = end < 0 ? chunk : chunk.slice(0, chunk.indexOf('</a>', end) + 4 || undefined);
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const link = unescape(card.match(LINK)?.[1] ?? '').trim();
		companies.push({ name, category: '', url: /^https?:\/\//i.test(link) ? link : PAGE_URL });
	}
	if (companies.length === 0) {
		throw new Error('beyondearth: no companies in the portfolio carousel');
	}

	return companies;
}
