import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.qbic.be';
const PAGE_URL = `${BASE_URL}/portfolio`;
const MAX_PAGES = 40;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio is a grid of cards, twenty-one a page
// (?0c8d6cbc_page=2), a card a company linking its page here, with its
// name, the fund it sits in ("Qbic III", "Qbic I & II"), its sector
// ("Biotech", "Deeptech"), the universities it came from and a line about
// it — for a company the fund is out of, the line is the sale ("Acquired
// by Agilent Technologies"). a company's page gives no site, so every
// company links its page here. the fund and the sector are kept as tags,
// a sale with its buyer and the Exited tag. every page of the grid must
// load.

const CARD = /(?=<div\b[^>]*role="listitem" class="portfolio-item w-dyn-item">)/;
const NAME = /<h3 class="portfolio-heading">([\s\S]*?)<\/h3>/;
const PAGE = /<a href="([^"]*)" class="portfolio-img-wrapper\b/;
// the card's tags: the fund's has no kind, a sector's is shown by its kind
// and the sectors not its own are hidden
const TAG = /<div class="tag(?: [a-z]+)?">\s*<div>([^<]*)<\/div>/g;
const LINE = /<\/h3>\s*<p>([\s\S]*?)<\/p>/;
const SALE = /^acquired by\s+(.+?)\.?$/i;
const NEXT = /href="(\?\w+_page=\d+)"[^>]*class="w-pagination-next\b/;
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
	const cards: string[] = [];
	for (let path: string | undefined = '', page = 0; path !== undefined && page < MAX_PAGES; page++) {
		const url: string = `${PAGE_URL}${path}`;
		const resp: Response = await fetch(url, { headers: { 'User-Agent': UA } });
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${url}: ${resp.status}`);
		}
		const html: string = await resp.text();
		cards.push(...html.split(CARD).slice(1));
		path = html.match(NEXT)?.[1];
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of cards) {
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const buyer = clean(card.match(LINE)?.[1] ?? '').match(SALE)?.[1];
		const path = card.match(PAGE)?.[1];
		companies.push({
			name,
			category: [
				...[...card.matchAll(TAG)].map(([, label]) => tag(label)),
				buyer ? `Acquired by ${tag(buyer)}` : '',
				buyer ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: path ? new URL(unescape(path), BASE_URL).href : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('qbic: no companies in the portfolio grid — the markup moved');
	}

	return companies;
}
