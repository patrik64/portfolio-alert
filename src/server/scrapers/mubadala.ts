import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.mubadalacapital.ae/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow under finsweet's list attributes, and generous: the page holds all
// eighty-five companies at once and pages through them eight at a time in the
// browser, so nothing has to be asked for twice. every card is a link straight
// out to the company, with the fund's fields named in the markup rather than
// left to be guessed at from where they sit.
//
// the fund writes each company's sector twice over — once as "sector" and once
// as "direction", the second only shown on a wide screen — and the two say the
// same thing on all eighty-five, so one of them is enough.
//
// what it calls a strategy is Private Equity, Ventures or Special Opportunities
// - Brazil, which are the fund's own three, one per section of the page. that
// is how the fund invests rather than anything about the company, so it goes
// the way other funds' vehicles do. where a company works is kept, though only
// thirty-five of them say.
//
// one company, HiveMQ, is filed under nothing at all and keeps its name and
// its address alone.

const CARD = /<a\b[^>]*?\brole="listitem"[^>]*?\bhref="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
// finsweet names each field on the element that holds it
const field = (name: string) => new RegExp(`fs-list-field="${name}"[^>]*>([\\s\\S]*?)</div>`);
// the fields that say something about the company
const KEPT = ['sector', 'geography'];

const clean = (s: string) =>
	s
		.replace(/<[^>]+>/g, ' ')
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;|&#8220;|&#8221;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, url, card] of html.matchAll(CARD)) {
		const name = clean(card.match(field('name'))?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({
			name,
			category: KEPT.map((label) => clean(card.match(field(label))?.[1] ?? ''))
				.filter(Boolean)
				.join(', '),
			url
		});
	}

	if (companies.length === 0) {
		throw new Error('mubadala: no companies in the portfolio list');
	}

	return companies;
}
