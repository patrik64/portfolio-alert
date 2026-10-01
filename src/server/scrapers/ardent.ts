import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://ardent.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio page is a table of companies served whole, each
// row the company's name, its co-investors, the stage the fund came in
// at, the stage it is at now, the theses the filter reads ("Financial
// Services", "Service-as-a-Software") and a link to its site. the theses
// and the stage the fund came in at are kept as tags; the stage it is at
// now changes, and is not. nothing marks an exit.

const ITEM = /(?=<div\b[^>]*\bclass="portfolio-item\b)/;
const NAME = /class="portfolio-company"[^>]*>([\s\S]*?)<\/div>/;
// the row's plain cells: the co-investors, the stage invested, the stage now
const CELL = /<div(?:\s+id="[^"]*")?(?:\s+class="is-hidden-tablet-down")?>([^<]*)<\/div>/g;
const THESIS = /\bdata-categories="[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
const SITE = /<a\b[^>]*\bhref="([^"]*)"[^>]*>\s*WEBSITE\s*<\/a>/i;
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

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		// the row, before the card that opens under it
		const card = item.indexOf('portfolio-row is-accordeon');
		const row = card < 0 ? item : item.slice(0, card);
		const name = clean(row.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const cells = [...row.matchAll(CELL)].map(([, cell]) => clean(cell));
		const site = unescape(row.match(SITE)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [...[...row.matchAll(THESIS)].map(([, thesis]) => tag(thesis)), tag(cells[1] ?? '')]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('ardent: no companies on the portfolio page');
	}

	return companies;
}
