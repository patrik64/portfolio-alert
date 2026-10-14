import type { ScrapedCompany } from './types';

const BASE_URL = 'https://encomenda.com';
const PAGE_URL = `${BASE_URL}/portfolio/`;
// the labels of the site's funds and sectors, by the slug a card is classed with
const TERMS_URL = (taxonomy: string) => `${BASE_URL}/wp-json/wp/v2/${taxonomy}?per_page=100&_fields=slug,name`;
const MAX_PAGES = 40;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the portfolio is a grid of cards, twelve a page
// (?query-0-page=2), a card a company with its logo, its name linking its
// site and a line about it, the card classed by the fund it came through
// ("type-of-fund-encomenda-seed-2"), its status ("type_of_status-exit")
// and its sector ("sector-traveltech"). the site names its funds and
// sectors in lists of its own ("Encomenda Seed II", "Traveltech"), read by
// those slugs. the fund and the sector are kept as tags, an exit with the
// Exited tag. a few names link the site through a mail filter's redirect
// (eu-central-1.protection.sophos.com/?…&u=<the address in base64>), and
// the address it leads to is kept. every page of the grid must load.

const CARD = /<li class="wp-block-post\b([^"]*)">([\s\S]*?)<\/li>/g;
const NAME = /<h2 class="wp-block-heading card-external-link">([\s\S]*?)<\/h2>/;
const HREF = /<a\b[^>]*\bhref="([^"]*)"/;
const NEXT = /<a href="([^"]*)" class="wp-block-query-pagination-next\b/;
const CLASSED = (prefix: string) => new RegExp(`\\b${prefix}-([a-z0-9-]+)`, 'g');
// a mail filter's redirect, the address it leads to in its u parameter
const REDIRECT = /^https?:\/\/[^/]*\.protection\.sophos\.com\//i;
const EXIT = /^exit(?:ed)?$/i;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

interface Term {
	slug?: string;
	name?: string;
}

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

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

// a taxonomy's labels by slug
async function labels(taxonomy: string): Promise<Map<string, string>> {
	const terms: Term[] = JSON.parse(await fetchText(TERMS_URL(taxonomy)));
	return new Map(terms.map((term) => [term.slug ?? '', tag(term.name ?? '')]));
}

// the address a mail filter's redirect leads to, or the link as it is
function unwrapped(link: string): string {
	if (!REDIRECT.test(link)) return link;
	try {
		const target = atob(new URL(link).searchParams.get('u') ?? '');
		return /^https?:\/\//i.test(target) ? target : link;
	} catch {
		return link;
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	// the whole grid, a page at a time; a part of it must not pass for the whole
	const cards: [string, string][] = [];
	for (let url: string | undefined = PAGE_URL, page = 0; url !== undefined && page < MAX_PAGES; page++) {
		const html: string = await fetchText(url);
		for (const [, classes, card] of html.matchAll(CARD)) cards.push([classes, card]);
		const next: string | undefined = html.match(NEXT)?.[1];
		url = next ? new URL(unescape(next), PAGE_URL).href : undefined;
	}
	const funds = await labels('type-of-fund');
	const sectors = await labels('sector');

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const [classes, card] of cards) {
		const heading = card.match(NAME)?.[1] ?? '';
		const name = clean(heading);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const site = unwrapped(unescape(heading.match(HREF)?.[1] ?? '').trim());
		if (/^https?:\/\//i.test(site)) withSite++;
		const classed = (prefix: string) => [...classes.matchAll(CLASSED(prefix))].map(([, slug]) => slug);
		companies.push({
			name,
			category: [
				...classed('type-of-fund').map((slug) => funds.get(slug) ?? ''),
				...classed('sector').map((slug) => sectors.get(slug) ?? ''),
				classed('type_of_status').some((slug) => EXIT.test(slug)) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('encomenda: no companies in the portfolio grid — the markup moved');
	}
	if (withSite === 0) {
		throw new Error("encomenda: no company's name links its site — the cards' markup moved");
	}

	return companies;
}
