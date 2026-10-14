import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.50partners.fr/startups/toutes';
const MAX_PAGES = 40;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the startups page is a list of cards, sixty-six a page
// (?61c4efee_page=2), a card a company named in its logo's alt text and
// linking its site, with a line about it, its sectors ("Fintech", "B2B
// SaaS") and the fund's programme it came through ("Tech", "Impact",
// "Health", "Web3"). a company the fund is out of shows "Acquired in 2025
// by Apave" — one, sold to its managers, the other way about ("Acquired in
// MBO by 2021"). the sectors and the programme are kept as tags, a sale
// with its buyer and the Exited tag. the page's header carries a list of
// its own with a pager, so the list's next page is read after the list.
// every page of the list must load.

const LIST = 'class="startup-list w-dyn-items"';
const CARD = /(?=<div role="listitem" class="startup-item w-dyn-item">)/;
const NAME = /<img\b[^>]*\balt="([^"]*)"[^>]*class="startup-logo-img"/;
const SITE = /<a\b[^>]*\bhref="([^"]*)"[^>]*class="startup-logo\b/;
const FIELD = (name: string) => new RegExp(`fs-list-field="${name}"[^>]*>([^<]*)<`, 'g');
// shown only for a sale: the condition hides it on the others
const SALE =
	/<div><div class="italic w-embed">Acquired in ([^<]*?) by<\/div><div\b[^>]*>([^<]*)<\/div>/;
const NEXT = /href="(\?\w+_page=\d+)"[^>]*class="w-pagination-next\b/;
const YEAR = /^(?:19|20)\d{2}$/;
const MBO = /^mbo$/i;
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

// "Acquired in 2025 by Apave" -> "Acquired by Apave"; "Acquired in MBO by 2021" -> "MBO"
function saleOf(card: string): string {
	const sale = card.match(SALE);
	if (!sale) return '';
	const [when, who] = [clean(sale[1]), clean(sale[2])];
	const buyer = YEAR.test(who) ? when : who;
	if (!buyer || YEAR.test(buyer)) return '';
	return MBO.test(buyer) ? 'MBO' : `Acquired by ${tag(buyer)}`;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	// the whole list, a page at a time; a part of it must not pass for the whole
	const cards: string[] = [];
	for (let path: string | undefined = '', page = 0; path !== undefined && page < MAX_PAGES; page++) {
		const url: string = `${PAGE_URL}${path}`;
		const resp: Response = await fetch(url, { headers: { 'User-Agent': UA } });
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${url}: ${resp.status}`);
		}
		const html: string = await resp.text();
		const at = html.indexOf(LIST);
		if (at < 0) {
			throw new Error(`50partners: ${url} carries no startup list — the markup moved`);
		}
		const list: string = html.slice(at);
		cards.push(...list.split(CARD).slice(1));
		path = list.match(NEXT)?.[1];
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const card of cards) {
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const fields = (field: string) => [...card.matchAll(FIELD(field))].map(([, value]) => tag(value));
		const sale = saleOf(card);
		const site = unescape(card.match(SITE)?.[1] ?? '').trim();
		if (/^https?:\/\//i.test(site)) withSite++;
		companies.push({
			name,
			category: [...fields('secteur'), ...fields('programme'), sale, sale ? 'Exited' : '']
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('50partners: no startups in the list — the markup moved');
	}
	if (withSite === 0) {
		throw new Error("50partners: no startup links its site — the cards' markup moved");
	}

	return companies;
}
