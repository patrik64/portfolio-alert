import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.echohealthventures.com/companies/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the companies page is two grids of cards, "Current" and
// "Alumni", the whole of each in the page. a current company's card links
// its site and gives its name and a line about it; an alumnus's card is its
// logo alone, named in the logo's alt text ("Livongo logo") where it is
// named at all, and a logo without one is left out. an alumnus is kept
// with the Exited tag; the page says nothing else of either.

const ALUMNI = 'company-cards--alumni';
const CARD = /(?=<div class="company-card">)/;
const NAME = /class="company-card__title">\s*<span>([\s\S]*?)<\/span>/;
const ALT = /<img\b[^>]*\balt="([^"]*)"/;
const SITE = /<a\s+class="company-card__link"\s+href="([^"]*)"/;
// "Livongo logo", "Logo Livongo"
const LOGO_WORD = /^logo\s+|\s+logo$/gi;
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
	const split = html.indexOf(ALUMNI);
	const grids = split < 0 ? [html] : [html.slice(0, split), html.slice(split)];
	const cards = grids.flatMap((grid, g) => grid.split(CARD).slice(1).map((card) => ({ card, alumnus: g === 1 })));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const { card, alumnus } of cards) {
		const name =
			clean(card.match(NAME)?.[1] ?? '') || clean(card.match(ALT)?.[1] ?? '').replace(LOGO_WORD, '').trim();
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const site = unescape(card.match(SITE)?.[1] ?? '').trim();
		if (/^https?:\/\//i.test(site)) withSite++;
		companies.push({
			name,
			category: alumnus ? 'Exited' : '',
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('echohealth: no companies on the companies page — the markup moved');
	}
	if (withSite === 0) {
		throw new Error("echohealth: no company links its site — the cards' markup moved");
	}

	return companies;
}
