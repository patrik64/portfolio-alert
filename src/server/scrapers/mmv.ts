import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://mmv.vc/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a hand-written page, all of it in one file — two megabytes of it, because
// every logo is inlined as base64 — with the portfolio as a card each. the
// card names the company twice, on its face and on its back, and the back also
// carries what the fund files it under, a line about it and its address.
//
// the one label a card has doubles as both things the fund might say: a sector
// for a company it holds, and Acquired for one it does not, which replaces the
// sector rather than joining it. that is the fund's own choice of what to show
// and is left as it is.
//
// Penblade's address is a product page on the site of the company that bought
// it. that is what the fund publishes for it, so that is what it keeps.

const CARD = /<div class="portco-card[^"]*">([\s\S]*?)(?=<div class="portco-card|<\/section>|$)/g;
const NAME = /class="portco-name">([\s\S]*?)<\/div>/;
const LABEL = /class="portco-tag">([\s\S]*?)<\/div>/;
const SITE = /class="portco-link"[^>]*\bhref="([^"]*)"/;

const clean = (s: string) =>
	s
		.replace(/<[^>]+>/g, ' ')
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;|&#8220;|&#8221;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, card] of html.matchAll(CARD)) {
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({
			name,
			category: clean(card.match(LABEL)?.[1] ?? ''),
			url: clean(card.match(SITE)?.[1] ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('mmv: no companies among the cards');
	}

	return companies;
}
