import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://goldhouse.org/ghv-companies/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, a theme of its own: gold house ventures' companies are cards on
// one page, each naming the company over a line about it and — all but the
// odd one — linking its site. the cards carry nothing to file a company
// under, and no sign of which the fund is out of.

const CARD = /(?=<(?:a|div|article|li)\b[^>]*class="card-portfolio")/;
const OPENING = /^<[^>]+>/;
const HREF = /\bhref="(https?:\/\/[^"]+)"/;
const NAME = /class="[^"]*\bcard-portfolio__title\b[^"]*"[^>]*>([\s\S]*?)<\/h\d>/;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of html.split(CARD).slice(1)) {
		// the title's icon is an svg, not part of the name
		const name = clean((card.match(NAME)?.[1] ?? '').replace(/<svg[\s\S]*?<\/svg>/g, ' '));
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			category: '',
			// the card itself is the link; one without a site is not a link at all
			url: unescape(card.match(OPENING)?.[0].match(HREF)?.[1] ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('goldhouse: no companies on the portfolio page');
	}

	return companies;
}
