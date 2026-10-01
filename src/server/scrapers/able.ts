import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://ablepartners.nyc/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, a theme of its own: the home page's portfolio is a grid of
// cards, each linking the company's site, naming it with "(Acquired)" or
// "(Exited)" after the ones the fund is out of, over a line about it, and
// carrying the terms the filter buttons above it read ("body", "mind"),
// spelled out on those buttons and kept as tags. "Featured" is the fund
// pointing at a company, not anything about it, and "All" is everything,
// so neither is kept. a strip of logos above repeats some of the cards.

const FILTER = /<button\b[^>]*\bdata-filter='([^']*)'[^>]*>([\s\S]*?)<\/button>/g;
const CARD = /<a\b([^>]*\bclass="portfolio-cards__cards__card\b[^"]*"[^>]*)>([\s\S]*?)<\/a>/g;
const HREF = /\bhref="([^"]*)"/;
const TERMS = /\bdata-filter-terms='([^']*)'/;
const TITLE = /class="portfolio-cards__cards__card__title"[^>]*>([\s\S]*?)<\/h2>/;
const STATUS = /<span\b[^>]*__title__status[^>]*>([\s\S]*?)<\/span>/;
const DROPPED = /^(?:featured|all)$/i;
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
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	// "mind" -> "Mind", from the filter buttons
	const labels = new Map<string, string>();
	for (const [, term, label] of html.matchAll(FILTER)) {
		if (!labels.has(term)) labels.set(term, tag(label));
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, attributes, body] of html.matchAll(CARD)) {
		const title = body.match(TITLE)?.[1] ?? '';
		const name = clean(title.replace(STATUS, ''));
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		// "(Acquired)", "(Exited)", "(exited)"
		const status = clean(title.match(STATUS)?.[1] ?? '').replace(/^\(|\)$/g, '');
		const went = /^acquired$/i.test(status) ? 'Acquired' : '';
		const out = went !== '' || /^exited$/i.test(status);
		const terms = (attributes.match(TERMS)?.[1] ?? '')
			.split(',')
			.map((term) => term.trim())
			.filter((term) => term && !DROPPED.test(term));
		const site = unescape(attributes.match(HREF)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [...terms.map((term) => labels.get(term) ?? tag(term)), went, out ? 'Exited' : '']
				.filter((t, i, all) => t && !DROPPED.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('able: no companies in the portfolio grid');
	}

	return companies;
}
