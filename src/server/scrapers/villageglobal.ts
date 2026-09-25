import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.villageglobal.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, rebuilt in september 2026: every card ships in the html, filtered
// in the browser by finsweet. a card names the company in a link to its site,
// over the fund's categories for it as labels ("Enterprise", "AI/ML"), and
// one the fund is out of wears an "EXIT" badge on its logo — drawn only
// where it applies, webflow hiding it on the rest. the founders beside each
// card are not read.

const CARD = /(?=<div role="listitem" class="portfolio-card w-dyn-item")/;
const NAME = /class="portfolio-card-link\b[^"]*"[^>]*>\s*<div class="heading-small">([\s\S]*?)<\/div>/;
const SITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*class="portfolio-card-link\b/;
const LABEL = /<div\b[^>]*class="label text-color-secondary"[^>]*>([^<]*)<\/div>/g;
const EXIT = /<div class="exit">/;
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
		// the founders' section closes the card; its "Founders" label is not a category
		const card = chunk.split('class="portfolio-meta"')[0];
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name)) continue;
		seen.add(name);
		const tags = [...card.matchAll(LABEL)].map((m) => clean(m[1])).filter(Boolean);
		if (EXIT.test(card)) tags.push('Exited');
		companies.push({
			name,
			category: tags.filter((t, i, all) => all.indexOf(t) === i).join(', '),
			url: unescape(card.match(SITE)?.[1] ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('villageglobal: no companies on the portfolio page');
	}

	return companies;
}
