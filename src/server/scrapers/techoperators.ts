import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.techoperators.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js, the page drawn on the server: a wall of stories, a card a company
// with its name and, for one sold, who bought it ("Acquired by Barracuda"),
// and beneath them "the record", every company again as a logo, named in its
// alt text, shortened ("Spectrum" for "Spectrum Security"), with its city,
// its site when it still has one, and the same "Acquired by …, 2026" line. the
// record is the portfolio; a company takes its card's fuller name when a card
// starts with the logo's. the founders' own story further down (Internet
// Security Systems) is neither. the city and its state are kept as tags, a
// sale as "Acquired by …" with the Exited tag.

const CELL = /<li class="rec-cell">([\s\S]*?)<\/li>/g;
const LOGO = /<img\b[^>]*\balt="([^"]*)"/;
const SITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
const CITY = /class="rec-city[^"]*"[^>]*>([\s\S]*?)<\/span>/;
const OUT = /class="rec-out[^"]*"[^>]*>([\s\S]*?)<\/span>/;
const CARD_NAME = /<p class="rv-co">([\s\S]*?)<\/p>/g;
const BUYER = /^Acquired by\s+(.+?)\s*(?:,\s*(?:19|20)\d{2})?$/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) =>
	unescape(s.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' '))
		.replace(/\s+/g, ' ')
		.replace(/\s+,/g, ',')
		.trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const cardNames = [...html.matchAll(CARD_NAME)].map(([, name]) => clean(name)).filter(Boolean);
	// the card whose name is the logo's, or starts with it as a whole word
	const fuller = (short: string) =>
		cardNames.find((name) => {
			const [a, b] = [name.toLowerCase(), short.toLowerCase()];
			return a === b || a.startsWith(`${b} `);
		}) ?? short;

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, cell] of html.matchAll(CELL)) {
		const short = clean(cell.match(LOGO)?.[1] ?? '');
		if (!short || STEALTH.test(short)) continue;
		const name = fuller(short);
		if (seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const buyer = clean(cell.match(OUT)?.[1] ?? '').match(BUYER)?.[1];
		companies.push({
			name,
			category: [
				// "San Francisco, CA" as the city and the state
				...clean(cell.match(CITY)?.[1] ?? '').split(/\s*,\s*/),
				buyer ? `Acquired by ${tag(buyer)}` : '',
				buyer ? 'Exited' : ''
			]
				.filter((t, k, all) => t && all.indexOf(t) === k)
				.join(', '),
			url: unescape(cell.match(SITE)?.[1] ?? '').trim() || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('techoperators: no companies in the record — the markup moved');
	}

	return companies;
}
