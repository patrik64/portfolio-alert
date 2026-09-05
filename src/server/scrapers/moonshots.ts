import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://moonshotscapital.com/portfolios/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, and the whole portfolio is written into the page as one article
// per company carrying its name and address as attributes — nothing has to be
// read out of the rendering, and nothing is paged.
//
// the fund badges a company as a unicorn or as veteran-led, which is what it
// invests in and says something about the company, and both are kept. it also
// badges an exit, but never without saying which kind underneath — Acquired by
// SiriusXM, IPO: HOOD, Merged with Mission Essential — so the sentence is kept
// in place of the word, the way one way's kinds of exit are. all thirty-nine
// exits have one.
//
// the badges are printed twice on each card, once for the wall and once for
// the hover, so they are gathered rather than counted.
//
// what a card also says is which of the fund's own vehicles holds the company
// — Angel, Syndicate, Fund 1 through 3 — and that is the fund's structure
// rather than anything about the company, so it is left off.
//
// a few addresses point at a news story or a facebook page rather than a site,
// for companies long gone. that is the address the fund publishes for them, so
// that is what they keep.

const CARD = /<article\b([^>]*\bclass="portfolio-item[^"]*"[^>]*)>([\s\S]*?)<\/article>/g;
const attribute = (name: string) => new RegExp(`\\b${name}="([^"]*)"`);
const BADGE = /<span class="label [^"]*">([\s\S]*?)<\/span>/g;
const EXIT = /class="portfolio-exit-label">([\s\S]*?)<\/p>/;
// the badge the fund never leaves to speak for itself
const SAYS_LITTLE = /^exit$/i;

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
	for (const [, attributes, card] of html.matchAll(CARD)) {
		const name = clean(attributes.match(attribute('data-title'))?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const ending = clean(card.match(EXIT)?.[1] ?? '');
		const badges = [...new Set([...card.matchAll(BADGE)].map((badge) => clean(badge[1])))].filter(
			(badge) => badge && !(ending && SAYS_LITTLE.test(badge))
		);

		companies.push({
			name,
			category: [...badges, ending].filter(Boolean).join(', '),
			url: clean(attributes.match(attribute('data-url'))?.[1] ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('moonshots: no companies in the portfolio');
	}

	return companies;
}
