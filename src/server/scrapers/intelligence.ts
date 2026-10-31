import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://intelligencevc.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a hand-made page, all of it written out: a card per company, linking its
// site, with its name, the field it works in ("Diagnostics") and how the fund
// came to it — "Direct Investment", "IV Accelerator" or both. the field and the
// badges are kept as tags. nothing marks an exit.

const CARD = /(?=<[a-z]+\b[^>]*\bclass="portfolio-item\b)/;
const SITE = /^<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
const NAME = /<div class="p-co-name">([\s\S]*?)<\/div>/;
const FIELD = /<div class="p-co-type">([\s\S]*?)<\/div>/;
const BADGE = /<span class="p-co-badge\b[^"]*">([\s\S]*?)<\/span>/g;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&rsquo;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&');

const clean = (s: string) =>
	unescape(s.replace(/<[^>]*>/g, ' '))
		.replace(/\s+/g, ' ')
		.trim();

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
		companies.push({
			name,
			category: [tag(card.match(FIELD)?.[1] ?? ''), ...[...card.matchAll(BADGE)].map(([, badge]) => tag(badge))]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: card.match(SITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('intelligence: no companies on the portfolio page');
	}

	return companies;
}
