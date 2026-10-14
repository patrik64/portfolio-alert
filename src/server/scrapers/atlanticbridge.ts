import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.abven.com';
const PAGE_URL = `${BASE_URL}/portfolio/`;
const EXITS_URL = `${BASE_URL}/realisations/`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// storyblok: the portfolio is two pages of logos, the current companies
// and the "Realisations". a current company's card gives its name and opens
// a lightbox, kept in the page and named on the card, with a line about it
// and its site, under "Visit Website". a realised company's card names it,
// its lightbox showing its buyer as a logo alone. a realisation is kept
// with the Exited tag and links the realisations page; the fund files
// nobody under a sector. both pages must load, or the list would be half
// of it.

const CARD = /class="portfolio" data-lightbox="#([^"]+)"[\s\S]*?class="portfolio__name">([\s\S]*?)<\/div>/g;
const LIGHTBOX = (id: string) =>
	new RegExp(`id="${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"([\\s\\S]*?)(?=<div class="columns\\b|</article>)`);
const SITE = /<a href="([^"]*)"[^>]*>\s*Visit Website\s*<\/a>/;
const EXIT = /class="logos__title">([\s\S]*?)<\/h2>/g;
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

async function page(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const [current, exits] = await Promise.all([page(PAGE_URL), page(EXITS_URL)]);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	const add = (name: string, exited: boolean, url: string) => {
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) return;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			category: [exited ? 'Exited' : ''].filter((t) => t && !UNSAID.test(t)).join(', '),
			url
		});
	};

	for (const [, lightbox, written] of current.matchAll(CARD)) {
		const site = unescape(current.match(LIGHTBOX(lightbox))?.[1].match(SITE)?.[1] ?? '').trim();
		add(clean(written), false, /^https?:\/\//i.test(site) ? site : PAGE_URL);
	}
	for (const [, written] of exits.matchAll(EXIT)) {
		add(clean(written), true, EXITS_URL);
	}

	if (companies.length === 0) {
		throw new Error('atlanticbridge: no companies on the portfolio pages — the markup moved');
	}

	return companies;
}
