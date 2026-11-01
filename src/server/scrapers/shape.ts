import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.shapecapital.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: a card per company, its logo's alt text the name and a link to its
// site, its sectors, countries and statuses as slugs on the card for the page's
// filters, whose drop-downs give the words for them. the statuses are "active",
// "previous-investment" and "exited", and most companies have the last two.
const CARD = /(?=<div class="company-item-style-2")/;
const SECTORS = /\bdata-sector="([^"]*)"/;
const COUNTRIES = /\bdata-country="([^"]*)"/;
const STATUSES = /\bdata-status="([^"]*)"/;
const NAME = /<img\b[^>]*\balt="([^"]*)"/;
const SITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*>\s*<span>\s*visit site/i;
const OPTION = /<option value="([^"]*)"[^>]*>([^<]*)/g;
const LOOSE_STATUS = /^(?:active|exited)$/;

const clean = (s: string) =>
	s
		.replace(/&amp;/g, '&')
		.replace(/&#0?39;|&#8217;|&rsquo;/g, "'")
		.replace(/\s+/g, ' ')
		.trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const words = new Map([...html.matchAll(OPTION)].map(([, slug, word]) => [slug, tag(word)]));
	const wordsFor = (slugs: string | undefined) =>
		(slugs ?? '')
			.split(/\s+/)
			.filter(Boolean)
			.map((slug) => words.get(slug) ?? slug);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of html.split(CARD).slice(1)) {
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const statuses = (card.match(STATUSES)?.[1] ?? '').split(/\s+/).filter(Boolean);
		companies.push({
			name,
			category: [
				...wordsFor(card.match(SECTORS)?.[1]),
				...wordsFor(card.match(COUNTRIES)?.[1]),
				...wordsFor(statuses.filter((status) => !LOOSE_STATUS.test(status)).join(' ')),
				statuses.includes('exited') ? 'Exited' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: card.match(SITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('shape: no companies on the portfolio page');
	}

	return companies;
}
