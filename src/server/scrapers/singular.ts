import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.singular.vc/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// astro: the home page's portfolio is a table, every company a row linking
// its site, with its name — one the fund is out of carrying an "[EXITED]"
// badge beside it — a line about it and its sector ("Techbio", "FinTech"),
// kept as a tag, an exit with the Exited tag. each row writes the name and
// the line twice, for small screens and large; the large screen's cells are
// read.

const ROW = /<a\s+href="([^"]*)"[^>]*\bdata-company-row\b[^>]*>([\s\S]*?)<\/a>/g;
// the large screen's cells: the name, the line about the company, the sector
const CELL = /<span class="relative z-10 hidden truncate md:block">([\s\S]*?)<\/span>\s*(?=<span\b)/g;
const BADGE = /\[\s*exited\s*\]/i;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
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
	for (const [, href, row] of html.matchAll(ROW)) {
		const [written = '', , sector = ''] = [...row.matchAll(CELL)].map(([, cell]) => clean(cell));
		const out = BADGE.test(written);
		const name = clean(written.replace(BADGE, ''));
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const site = unescape(href).trim();
		companies.push({
			name,
			category: [tag(sector), out ? 'Exited' : '']
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error("singular: no companies in the home page's portfolio table — the markup moved");
	}

	return companies;
}
