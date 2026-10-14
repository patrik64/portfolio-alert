import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://swanlaab.com/portfolio/';
const MAX_PAGES = 40;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress with elementor: the portfolio page is a grid of cards, "All"
// and a tab a fund (agrifood, search, …) beside it, each twenty-four a page
// and the rest behind "Load more" (/portfolio/2/), a card a company with
// its name, its site and a panel giving the month the fund invested, its
// sectors ("Fintech", "Biotechnology, Aquaculture"), its status ("In
// portfolio", "We tried", "Acquired by PSG in 2024"), the fund it sits in
// and its country. the cards of every grid on every page are read, each
// company once. the sectors, the fund, the country and the year are kept as
// tags, a sale with its buyer and the Exited tag, one the fund "tried" with
// the Closed tag. every page of the grid must load.

const CARD = /(?=<div data-elementor-type="loop-item")/;
const NAME =
	/data-widget_type="theme-post-title\.default"><div class="elementor-widget-container"><div class="elementor-heading-title[^"]*">([\s\S]*?)<\/div>/;
// the card's site, the link marked with a globe
const SITE = /<a href="([^"]*)"[^>]*>\s*<span class="elementor-icon-list-icon">\s*<i aria-hidden="true" class="icon pwline-globe-/;
const FACT = (label: string) => new RegExp(`<b>${label}:</b>([\\s\\S]*?)</span>`);
// the "Load more" anchor: data-page="1" data-max-page="2" data-next-page="…/portfolio/2/"
const MORE = /data-page="(\d+)" data-max-page="(\d+)" data-next-page="([^"]*)"/;
const YEAR = /\b(?:19|20)\d{2}\b/;
// "Acquired by Semrush (NYSE: SEMR) in 2022"
const SALE = /^acquired by\s+(.+?)(?:\s+in\s+(?:19|20)\d{2})?$/i;
const TRIED = /^we tried$/i;
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
	// every page of the grids; a part of them must not pass for the whole
	const cards: string[] = [];
	for (let url: string | undefined = PAGE_URL, page = 0; url !== undefined && page < MAX_PAGES; page++) {
		const resp: Response = await fetch(url, { headers: { 'User-Agent': UA } });
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${url}: ${resp.status}`);
		}
		const html: string = await resp.text();
		cards.push(...html.split(CARD).slice(1));
		const more = html.match(MORE);
		url = more && Number(more[1]) < Number(more[2]) ? new URL(unescape(more[3]), PAGE_URL).href : undefined;
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of cards) {
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const fact = (label: string) => clean(card.match(FACT(label))?.[1] ?? '');
		const status = fact('Status');
		const buyer = status.match(SALE)?.[1];
		const year = fact('Date of Investment').match(YEAR)?.[0];
		// a few addresses end in a stray space the page keeps encoded: "iriusrisk.com/%20"
		const site = unescape(card.match(SITE)?.[1] ?? '')
			.trim()
			.replace(/(?:%20)+$/, '');
		companies.push({
			name,
			category: [
				...fact('Sector').split(',').map(tag),
				tag(fact('Fund')),
				tag(fact('Country')),
				year ? `Invested ${year}` : '',
				buyer ? `Acquired by ${tag(buyer)}` : '',
				buyer ? 'Exited' : TRIED.test(status) ? 'Closed' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('swanlaab: no companies in the portfolio grid — the markup moved');
	}

	return companies;
}
