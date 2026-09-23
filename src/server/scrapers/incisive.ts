import type { ScrapedCompany } from './types';

const BASE_URL = 'https://incisive.vc';
const PAGE_URL = `${BASE_URL}/investments/`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a static astro site: every investment is a card naming the company, listing
// the vehicles it sits in (fund 1, the access fund, the syndicate, the
// opportunity fund) as a data attribute, and linking the company's site — or,
// for a dozen without one, only the investment memo the fund wrote here, which
// stands in for the address where there is one. the vehicles are the
// category; what the card says besides is a sentence.

const CARD = /(?=<[a-z]+[^>]*class="[^"]*\binvestment-card\b)/;
const NAME = /<h2[^>]*>([\s\S]*?)<\/h2>/;
const FUNDS = /data-funds="([^"]*)"/;
const SITE = /<a href="(https?:\/\/[^"]+)"[^>]*>\s*Website/;
const MEMO = /<a href="(\/[^"]+)"[^>]*>\s*Read memo/;

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
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const memo = card.match(MEMO)?.[1];
		companies.push({
			name,
			category: unescape(card.match(FUNDS)?.[1] ?? '')
				.split('|')
				.map((fund) => fund.trim())
				.filter(Boolean)
				.join(', '),
			url: card.match(SITE)?.[1] ?? (memo ? `${BASE_URL}${memo}` : '')
		});
	}

	if (companies.length === 0) {
		throw new Error('incisive: no companies on the investments page');
	}

	return companies;
}
