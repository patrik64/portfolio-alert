import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.4impact.vc/portfolio';
const MAX_PAGES = 40;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow with jetboost: the portfolio is a list of cards, the whole of it
// in the page, jetboost paging it in the browser; a card a company, each a
// small slider — a line and its founders, then a heading and a few lines
// about it with a link to its site, then the year the fund invested — and
// keyed for jetboost by the company's slug ("the-next-closet"). above the
// list a grid of its logos, a few named in their alt text ("Regulate
// logo"). the cards write the company's name nowhere else, so it is the
// logo's alt text where there is one, or else the words in the lines that
// spell the company's slug or its site's name ("The Next Closet",
// "suena’s" for suena.energy). a card whose lines name the company nowhere
// is left out. the year is kept as a tag; the fund does not say which
// companies it is out of. a list paged by webflow would be read page by
// page, every page of it.

const CARD = /(?=<div role="listitem" class="founder-overview-item w-dyn-item">)/;
const KEY = /class="jetboost-list-item" value="([^"]*)"/;
// a logo of the grid above, by the slug it is keyed with
const LOGO =
	/class="jetboost-list-item" value="([^"]*)" \/><\/div><a\b[^>]*class="filter-logo\b[^"]*"[^>]*><img\b[^>]*\balt="([^"]*)"/g;
// the second slide's lines: a heading, empty on some, then what the company
// does; the first slide's heading is the card's quote, its lines the founders
const LINES =
	/<div class="founder-item-content"><h3(?:| class="w-dyn-bind-empty")>[\s\S]*?<\/h3><h6>([\s\S]*?)<\/h6>/;
const SITE = /class="founder-item-btn"><a href="([^"]*)"/;
const YEAR = /class="year-invested">\s*((?:19|20)\d{2})/;
const NEXT = /href="(\?\w+_page=\d+)"[^>]*class="w-pagination-next\b/;
// "Regulate logo", "Logo Regulate"
const LOGO_WORD = /^logo\s+|\s+logo$/gi;
// a word as a name may be written: "SkillsCV", "exnaton’s"
const WORD = /[\p{L}\p{N}][\p{L}\p{N}.&'’+-]*/gu;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

const spelled = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// a phrase without the possessive it ends on: "GreenShift’s" -> "GreenShift"
const bare = (s: string) => s.replace(/[.,;:]+$/, '').replace(/['’]s?$/, '');

// the earliest words in the lines that spell the company's slug or its site's name
function namedIn(lines: string, slug: string, site: string): string {
	const host = site.replace(/^https?:\/\/(?:www\.)?/i, '').split(/[/?#]/)[0].split('.')[0];
	const keys = [slug, host].map(spelled).filter(Boolean);
	const words = lines.match(WORD) ?? [];
	for (let i = 0; i < words.length; i++) {
		for (let n = Math.min(4, words.length - i); n >= 1; n--) {
			const phrase = bare(words.slice(i, i + n).join(' '));
			if (keys.includes(spelled(phrase))) return phrase;
		}
	}
	return '';
}

export async function scrape(): Promise<ScrapedCompany[]> {
	// the whole list, a page at a time; a part of it must not pass for the whole
	const cards: string[] = [];
	const named = new Map<string, string>();
	for (let path: string | undefined = '', page = 0; path !== undefined && page < MAX_PAGES; page++) {
		const url: string = `${PAGE_URL}${path}`;
		const resp: Response = await fetch(url, { headers: { 'User-Agent': UA } });
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${url}: ${resp.status}`);
		}
		const html: string = await resp.text();
		cards.push(...html.split(CARD).slice(1));
		for (const [, slug, alt] of html.matchAll(LOGO)) {
			const name = clean(alt).replace(LOGO_WORD, '').trim();
			if (name) named.set(slug, name);
		}
		path = html.match(NEXT)?.[1];
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of cards) {
		const slug = card.match(KEY)?.[1] ?? '';
		const site = unescape(card.match(SITE)?.[1] ?? '').trim();
		const name = named.get(slug) || namedIn(clean(card.match(LINES)?.[1] ?? ''), slug, site);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const year = card.match(YEAR)?.[1];
		companies.push({
			name,
			category: year ? `Invested ${year}` : '',
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('4impact: no companies in the portfolio list — the markup moved');
	}

	return companies;
}
