import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.bigsurventures.vc/portfolio';
const MAX_PAGES = 40;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio is a grid of cards, the whole of it in the page, a
// card a company whose panel is filled from a record the card writes into
// the page's script — its name, the year it was founded, the year the fund
// invested, its status ("Activa", "Exit", "Partial Exit", "Went Down
// Fighting") and its site — with its sectors ("SaaS", "Fintech", "Quantum")
// pushed onto it after. the sectors and the years are kept as tags, a sale
// with the Exited tag and a company that went down with the Closed tag; a
// partial exit leaves the fund in, and is kept as written. a grid paged by
// webflow would be read page by page, every page of it.

const CARD = /(?=<div role="listitem" class="collection-item w-dyn-item">)/;
const FIELD = (name: string) => new RegExp(`\\b${name}: "((?:[^"\\\\]|\\\\.)*)"`);
const SECTOR = /\.sectors\.push\("((?:[^"\\]|\\.)*)"\)/g;
const NEXT = /href="(\?\w+_page=\d+)"[^>]*class="w-pagination-next\b/;
const YEAR = /\b(?:19|20)\d{2}\b/;
const EXITED = /^exit(?:ed)?$/i;
const PARTIAL = /^partial exit$/i;
const DOWN = /^went down fighting$/i;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/\\(["\\/])/g, '$1')
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
	let withSite = 0;
	for (const card of cards) {
		const field = (name: string) => clean(card.match(FIELD(name))?.[1] ?? '');
		const name = field('claim');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const status = field('status');
		const founded = field('founded').match(YEAR)?.[0];
		const invested = field('invested').match(YEAR)?.[0];
		const site = field('website');
		if (/^https?:\/\//i.test(site)) withSite++;
		companies.push({
			name,
			category: [
				...[...card.matchAll(SECTOR)].map(([, sector]) => tag(sector)),
				founded ? `Founded ${founded}` : '',
				invested ? `Invested ${invested}` : '',
				EXITED.test(status)
					? 'Exited'
					: DOWN.test(status)
						? 'Closed'
						: PARTIAL.test(status)
							? 'Partial Exit'
							: ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('bigsur: no companies in the portfolio grid — the markup moved');
	}
	if (withSite === 0) {
		throw new Error("bigsur: no company's record gave its site — the cards' markup moved");
	}

	return companies;
}
