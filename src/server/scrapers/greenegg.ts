import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://greenegg.vc/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a static site on netlify, the portfolio a section of the home page: every
// company is a card, most of them hidden until "show more" is pressed, whose
// back names it, says what it does and links its site. a company the fund is
// out of wears a badge saying how — "Acquired by DataRobot", "Secondary
// Sale" — and links, often as not, to its buyer; the badge is kept, with the
// Exited tag.

const CARD = /(?=<div class="port-card\b)/;
const NAME = /class="card-back-name"[^>]*>([\s\S]*?)<\/div>/;
const EXIT = /class="card-back-exit"[^>]*>([\s\S]*?)<\/div>/;
const SITE_LINK = /<a\b[^>]*\bclass="card-back-link"[^>]*>/;
const HREF = /\bhref="([^"]+)"/;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a note holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of html.split(CARD).slice(1)) {
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const exit = tag(card.match(EXIT)?.[1] ?? '');
		companies.push({
			name,
			category: exit ? `${exit}, Exited` : '',
			url: unescape(card.match(SITE_LINK)?.[0].match(HREF)?.[1] ?? '').trim()
		});
	}

	if (companies.length === 0) {
		throw new Error('greenegg: no portfolio cards on the home page');
	}

	return companies;
}
