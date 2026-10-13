import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://juvovc.org/';
const PORTFOLIO_URL = `${PAGE_URL}#portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// the portfolio is a section of the home page now (/portfolio/ sends you
// there): a grid of cards, each flipping over to a line about the company,
// filtered by the fund it was backed from ("Fund I", "Fund II"). a card
// gives the company's name and its fund, kept as a tag, and links nowhere,
// so a company links the section.

const CARD = /(?=<div class="jv-card")/;
const FUND = /^<div class="jv-card"[^>]*\bdata-fund="([^"]*)"/;
// the card's face: the name, then the fund's badge
const NAME = /<span\b[^>]*>([^<]*)<\/span>/;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
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

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of html.split(CARD).slice(1)) {
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const fund = tag(card.match(FUND)?.[1] ?? '');
		companies.push({ name, category: UNSAID.test(fund) ? '' : fund, url: PORTFOLIO_URL });
	}

	if (companies.length === 0) {
		throw new Error('juvo: no companies on the home page — the portfolio moved');
	}

	return companies;
}
