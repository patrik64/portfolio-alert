import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://haystack.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// framer, rendered on the server: each company is a card linking its site,
// with its name and a line about it. the page draws the portfolio once per
// screen size, so the cards are deduplicated by address. the sectors above the
// grid are headings the fund groups by in the browser, not something a card
// carries. a company that has listed says so after its name — "DoorDash (IPO:
// $DASH)", "Wag ($PET)" — which moves to the category with the Exited tag.

const CARD = /<a\b[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
const COMPANY = /data-framer-name="Company"[^>]*>\s*<p[^>]*>([\s\S]*?)<\/p>/;
const NOTE = /\s*\(([^)]*)\)\s*$/;
// a listing — "IPO: $DASH", "$PET" — as opposed to an older name in brackets
const LISTING = /\bipo\b|^\$|\b(nyse|nasdaq)\b/i;

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
	for (const [, url, card] of html.matchAll(CARD)) {
		const listed = clean(card.match(COMPANY)?.[1] ?? '');
		if (!listed) continue;
		const note = listed.match(NOTE)?.[1]?.trim() ?? '';
		const listing = note && LISTING.test(note) ? note : '';
		const name = listing ? listed.replace(NOTE, '').trim() : listed;
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			category: listing ? `${listing}, Exited` : '',
			url: unescape(url)
		});
	}

	if (companies.length === 0) {
		throw new Error('haystack: no companies on the portfolio page');
	}

	return companies;
}
