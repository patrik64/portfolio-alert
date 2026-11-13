import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.another.vc/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the front page's "our companies" is a short row of cards, a handful
// the fund features, each a logo named by its alt text, a line on what the
// company does and a link to its site. the whole portfolio sits in a shared
// airtable view, which the last card links ("All companies") and which
// airtable serves only to its own web client, so it is not read: what is
// tracked is the featured row, a company taking its turn there counted as
// new. the cards say nothing of sectors or exits.

const CARD = /<div\b[^>]*\brole="listitem"[^>]*\bclass="c-card\b[^"]*"[^>]*>([\s\S]*?)(?=<div\b[^>]*\brole="listitem"|$)/g;
const LINK = /<a\b[^>]*\bhref="([^"]*)"[^>]*\bclass="c-card_link\b/;
const NAME = /<img\b[^>]*\balt="([^"]*)"[^>]*\bclass="c-card_logo\b/;
// the card linking the airtable view of the whole portfolio
const ALL = /^all\b/i;
const LIST_HOST = /^https?:\/\/(?:[\w-]+\.)*airtable\.com\//i;
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

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, card] of html.matchAll(CARD)) {
		const link = unescape(card.match(LINK)?.[1] ?? '').trim();
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || ALL.test(name) || LIST_HOST.test(link) || STEALTH.test(name)) continue;
		if (seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: '', url: /^https?:\/\//i.test(link) ? link : PAGE_URL });
	}

	if (companies.length === 0) {
		throw new Error('another: no company cards on the front page — the markup moved');
	}

	return companies;
}
