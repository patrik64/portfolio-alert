import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://blacksheep.ventures/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a card per company with its name, linked to its site on most, the fund it came
// from, its sectors joined by a dot, a line about it, and on some a badge: the
// green one says who bought it. fund ii's cards are all "Confidential", under nda
// until the fund launches, so they name no one yet.
const CARD = /(?=<div class="portfolio-card[ "])/;
const NAME = /class="company-name"[^>]*>\s*(?:<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*>)?([^<]*)/;
const FUND = /class="company-fund-badge"[^>]*>([^<]*)/;
const SECTORS = /class="company-sector"[^>]*>([^<]*)/;
const EXIT = /class="exit-badge exit-badge--green"[^>]*>[^<]*?Exit\s*(?:→|&rarr;)\s*([^<(]*)/;
const CONFIDENTIAL = /^confidential$/i;

const clean = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&rsquo;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const cards = (await resp.text()).split(CARD).slice(1);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of cards) {
		const [, url = '', shown = ''] = card.match(NAME) ?? [];
		const name = clean(shown);
		if (!name || CONFIDENTIAL.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const buyer = tag(card.match(EXIT)?.[1] ?? '');
		companies.push({
			name,
			category: [
				...(card.match(SECTORS)?.[1] ?? '').split(/\s*(?:·|&middot;)\s*/).map(tag),
				tag(card.match(FUND)?.[1] ?? ''),
				buyer ? `Acquired by ${buyer}` : '',
				buyer ? 'Exited' : ''
			]
				.filter(Boolean)
				.join(', '),
			url
		});
	}

	if (companies.length === 0) {
		throw new Error('blacksheep: no companies on the portfolio page');
	}

	return companies;
}
