import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://amplifycapital.ca/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// framer: the home page's portfolio is a run of cards, each drawn once per
// screen size, with the company's logo, the fund it came from ("I"), a
// line about it, its industry ("CLIMATE", "HEALTH", "WORK") and, for the
// ones the fund is out of, how it went ("Acquired"). no card links
// anywhere and the logos have no alt text, so the names are kept here by
// the logos' images, as the logos read; a logo not listed here is left out
// until it is added. the fund and the industry are kept as tags.
const LOGOS: Record<string, string> = {
	'9Q4nCABT9qjtveLiUUUmgWobxo': 'ThinkLabs',
	EBa26LI253oXR6hW15LCjA3crbI: 'Airloom',
	UD1XPG4rrno5QRCQaNCkIyrknoE: 'Lumina',
	YCWDXmH0UlD83UAVJf88JgXbfc: 'Valence Labs',
	ha1uvyOsUtSo1mrHCOE6LiwTW8g: 'Future Fields',
	mecjx8xVNeQL3xa9yD6rZqSI: 'Inference Health',
	qRYZyLaqIpLZMAdEvT1bqcIHaQ: 'Pathway',
	ra0S9vUFNXb2FQPvD2Le1Olmqk: 'Endor',
	v0Q9R2GJq0eQpREItHZXfvC0: 'Hydrostor'
};

const CARD = /(?=<(?:a|div)\b[^>]*\bdata-framer-name="(?:Desktop|Tablet|Mobile)")/;
const IMAGE = /<img\b[^>]*\bsrc="https:\/\/framerusercontent\.com\/images\/([\w-]+)\.\w+/;
const FUND = /data-framer-name="Fund Text"[\s\S]*?<h6\b[^>]*>([\s\S]*?)<\/h6>/;
const INDUSTRY = /data-framer-name="Industry"[\s\S]*?<h6\b[^>]*>([\s\S]*?)<\/h6>/;
// the label beside the industry, empty but for the ones the fund is out of
const OUTCOME = /data-framer-name="Arrow and Label"[\s\S]*?<h6\b[^>]*>([\s\S]*?)<\/h6>/;
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

// "CLIMATE" -> "Climate", as the page's filter writes it
const capital = (s: string) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s);

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of html.split(CARD).slice(1)) {
		if (!FUND.test(card) && !INDUSTRY.test(card)) continue;
		const name = LOGOS[card.match(IMAGE)?.[1] ?? ''] ?? '';
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const fund = tag(card.match(FUND)?.[1] ?? '');
		const went = tag(card.match(OUTCOME)?.[1] ?? '');
		companies.push({
			name,
			category: [
				fund ? `Fund ${fund}` : '',
				capital(tag(card.match(INDUSTRY)?.[1] ?? '')),
				went,
				went ? 'Exited' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('amplifycapital: no known logos in the portfolio');
	}

	return companies;
}
