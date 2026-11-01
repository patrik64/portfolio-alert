import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://bookmarkpartners.com/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// one hand-written page: the portfolio is a row of cards near its end, each with a
// logo, a sector, a name, a line about the company and its address.
const CARD = /(?=<article class="card")/;
const NAME = /<h3\b[^>]*>([\s\S]*?)<\/h3>/;
const SECTOR = /class="sector"[^>]*>([\s\S]*?)<\/div>/;
const SITE = /<a\b[^>]*class="dom"[^>]*\bhref="(https?:\/\/[^"]+)"/;

const clean = (s: string) =>
	s
		.replace(/<[^>]*>/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&#0?39;|&rsquo;/g, "'")
		.replace(/\s+/g, ' ')
		.trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const cards = (await resp.text()).split(CARD).slice(1);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of cards) {
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			// the category is comma-joined, so a label holding a comma would read as two
			category: clean(card.match(SECTOR)?.[1] ?? '').replace(/\s*,\s*/g, ' / '),
			url: card.match(SITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('bookmark: no companies on the page');
	}

	return companies;
}
