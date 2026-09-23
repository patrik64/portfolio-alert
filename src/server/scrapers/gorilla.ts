import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://gorillacapital.fi/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, a theme of its own: the whole portfolio is one list of cards,
// each naming the company, saying what it does and linking its site written
// out, and carrying what the page's filters read as data attributes — the
// fund it came from ("Fund II") and whether the fund has exited it. a card
// with no fund says only "Fund". the names are capitalized by the
// stylesheet, so they are kept as written ("eWatt").

const CARD = /(?=<li\b[^>]*class="[^"]*\bcompany-item\b)/;
const OPENING = /^<li\b[^>]*>/;
const NAME = /<h3\b[^>]*>([\s\S]*?)<\/h3>/;
const SITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
const FUND = /\bdata-year="([^"]*)"/;
const EXITED = /\bdata-exited="true"/;
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
	for (const chunk of html.split(CARD).slice(1)) {
		// the last card would otherwise run on into the footer's links
		const card = chunk.split('</li>')[0];
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const opening = card.match(OPENING)?.[0] ?? '';
		const fund = clean(opening.match(FUND)?.[1] ?? '');
		companies.push({
			name,
			category: [/^fund\s+\S/i.test(fund) ? fund : '', EXITED.test(opening) ? 'Exited' : '']
				.filter(Boolean)
				.join(', '),
			url: unescape(card.match(SITE)?.[1] ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('gorilla: no companies on the portfolio page');
	}

	return companies;
}
