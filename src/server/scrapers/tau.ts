import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.tauventures.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// astro, rendered on the server: each card is a link to the company's site
// naming the company in its label, with the stage the fund came in at
// ("Seed", "Series A") after it, and carrying the sector the company is
// filed under and whether it has exited as attributes, which the page's own
// filters read. in october 2026 the cards were redrawn — a new class, and
// links to the companies' sites where before they opened the fund's own
// write-ups, each tagged "?ref=tauventures.com", which is dropped — the
// label and the attributes staying as they were.

const CARD = /<a\b[^>]*\bclass="company-card\b[^"]*"[^>]*>/g;
const HREF = /\bhref="([^"]*)"/;
const CATEGORY = /\bdata-category="([^"]*)"/;
const EXITED = /\bdata-exited="([^"]*)"/;
// "View Alaffia Health portfolio page. Investment stage: Seed"
const LABEL = /\baria-label="View (.*?) portfolio page(?:\. Investment stage: ([^"]*))?"/;
const REF = /\?ref=tauventures\.com$/;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

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
	for (const [card] of html.matchAll(CARD)) {
		const label = card.match(LABEL);
		const name = clean(label?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const link = unescape(card.match(HREF)?.[1] ?? '').trim().replace(REF, '');
		companies.push({
			name,
			category: [
				tag(card.match(CATEGORY)?.[1] ?? ''),
				tag(label?.[2] ?? ''),
				card.match(EXITED)?.[1] === 'true' ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(link) ? link : ''
		});
	}

	if (companies.length === 0) {
		throw new Error('tau: no companies on the portfolio page');
	}
	if (!companies.some((c) => c.url)) {
		throw new Error("tau: the cards' links to the companies' sites moved");
	}

	return companies;
}
