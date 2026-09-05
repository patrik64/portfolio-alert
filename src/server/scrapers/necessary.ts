import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.necessary.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// framer, which names the parts of a card in the markup, so the fields are
// read by those names rather than by where they fall.
//
// the page is served four times over, once for each breakpoint, and only one
// of the four is ever shown; the other three are dropped by name.
//
// carrying a company name is also what tells a card from the fund's own footer
// links, five of which are outward-facing in the same way — its privacy
// policy, its terms, the lp portal, linkedin and x.
//
// the fund says nothing about what a company does beyond a sentence
// describing it, which is prose rather than a label, so the category is empty
// for all but the two companies that have listed. those two carry a badge over
// the logo, kept in the fund's own word for it: IPO.

const CARD = /<a\b([^>]*)>([\s\S]*?)<\/a>/g;
const HREF = /\bhref="(https?:\/\/[^"]+)"/;
// each field runs from the end of its own opening tag to the start of the next
// named one, so that half of a tag never lands in a name
const NAME = /data-framer-name="Company Name"[^>]*>([\s\S]*?)(?=<[^>]*data-framer-name=|<\/a>|$)/;
const STATUS = /data-framer-name="Status Text"[^>]*>([\s\S]*?)(?=<[^>]*data-framer-name=|<\/a>|$)/;

const clean = (s: string) =>
	s
		.replace(/<[^>]+>/g, ' ')
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;|&#8220;|&#8221;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
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
	const body = html.slice(html.indexOf('<body'));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, attributes, card] of body.matchAll(CARD)) {
		const url = attributes.match(HREF)?.[1];
		if (!url) continue;

		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({
			name,
			category: clean(card.match(STATUS)?.[1] ?? ''),
			url
		});
	}

	if (companies.length === 0) {
		throw new Error('necessary: no companies in the portfolio grid');
	}

	return companies;
}
