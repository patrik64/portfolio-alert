import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://industrifonden.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow (the site left wordpress in september 2026): the portfolio is one
// list of accordions, each naming the company over a line about it and
// opening onto a card of facts for finsweet's filters — the area the fund
// files it under ("Deep tech & planetary health", "Life science"), its status
// ("Active" or "Selected exits", the companies the fund is out of), its site
// and the partner who covers it, which is not kept.

const ITEM = /(?=<div[^>]*role="listitem"[^>]*class="[^"]*\baccordion-item\b)/;
const NAME = /class="headline-sans-m">([\s\S]*?)<\/div>/;
const AREA = /fs-list-field="area"[^>]*>([\s\S]*?)<\/div>/;
const STATUS = /fs-list-field="status"[^>]*>([\s\S]*?)<\/div>/;
const SITE = /WEBSITE<\/div>\s*<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
const EXITS = /\bexits?\b/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;|&rsquo;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

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
	for (const item of html.split(ITEM).slice(1)) {
		const name = clean(item.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const exited = EXITS.test(clean(item.match(STATUS)?.[1] ?? ''));
		companies.push({
			name,
			category: [tag(item.match(AREA)?.[1] ?? ''), exited ? 'Exited' : ''].filter(Boolean).join(', '),
			url: unescape(item.match(SITE)?.[1] ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('industrifonden: no companies in the portfolio list — the layout moved');
	}

	return companies;
}
