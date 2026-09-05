import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://maplevc.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a hand-written page, one card per company. the card is about the founder as
// much as the company — their photograph, their name, the school they came
// from — and the company itself is named only in the alt text on its logo,
// which is where the name is taken from.
//
// the fund files each card under a category whose word is on its own filter,
// and under a stage. the stage is the round it came in at, which is the shape
// of the investment rather than the company, so it is left off — except where
// it says something else instead, which for two companies it does: acquired.
//
// the card also says where the company is and where its founder studied. the
// first is about the company and is kept; the second is not.
//
// eight companies are linked to nothing — a bare # — and keep no address.

const CARD = /<a class="port-card[^"]*"([^>]*)>([\s\S]*?)<\/a>/g;
const NAME = /class="port-card-logo"><img[^>]*?\balt="([^"]*)"/;
const attribute = (name: string) => new RegExp(`\\b${name}="([^"]*)"`);
const META = /class="port-card-meta-item">([\s\S]*?)<\/span>/g;
// the fund's own word for each category it filters by
const FILTER = /data-filter="category" data-value="([^"]*)"[^>]*>([^<]*)</g;
// what a stage says when it is only the round the fund came in at
const A_ROUND = /^(?:pre-?seed|seed|series-[a-z])$/i;
// the fund writes where a company is with a label in front of it
const WHERE = /^HQ\s+(.+)$/i;

const clean = (s: string) =>
	s
		.replace(/<[^>]+>/g, ' ')
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;|&#8220;|&#8221;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

const titled = (s: string) =>
	s === s.toLowerCase() ? s.replace(/\b[a-z]/g, (c) => c.toUpperCase()) : s;

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const words = new Map<string, string>();
	for (const [, slug, said] of html.matchAll(FILTER)) {
		const word = clean(said);
		if (slug && word) words.set(slug, word);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, attributes, card] of html.matchAll(CARD)) {
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const category = clean(attributes.match(attribute('data-category'))?.[1] ?? '');
		const stage = clean(attributes.match(attribute('data-stage'))?.[1] ?? '');
		const where = [...card.matchAll(META)]
			.map((meta) => clean(meta[1]).match(WHERE)?.[1] ?? '')
			.filter(Boolean);
		const url = clean(attributes.match(attribute('href'))?.[1] ?? '');

		companies.push({
			name,
			category: [
				words.get(category) ?? '',
				...where,
				stage && !A_ROUND.test(stage) ? titled(stage) : ''
			]
				.filter(Boolean)
				.join(', '),
			url: /^https?:\/\//i.test(url) ? url : ''
		});
	}

	if (companies.length === 0) {
		throw new Error('maple: no companies among the cards');
	}

	return companies;
}
