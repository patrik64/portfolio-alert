import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://alpaca.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// framer, with a component of the fund's own: the portfolio page is a run
// of grids under the fund's themes ("Energy Abundance", "Human Agency"),
// kept as tags, and "Notable Exits", each cell a logo, most of them drawn
// once the visitor scrolls to them, named in the cell's data and linking
// the company's site. a company under "Notable Exits" is one the fund is
// out of.

const SECTION = /(?=<section\b[^>]*\bclass="pml3-section\b)/;
const HEADING = /<h2\b[^>]*>([\s\S]*?)<\/h2>/;
const CELL = /<a\b([^>]*\bclass="pml3-cell\b[^"]*"[^>]*)>/g;
const COMPANY = /\bdata-company="([^"]*)"/;
const HREF = /\bhref="([^"]*)"/;
const EXITS = /^notable exits$/i;
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
	for (const chunk of html.split(SECTION).slice(1)) {
		const section = chunk.slice(0, chunk.indexOf('</section>') + 1 || undefined);
		const heading = tag(section.match(HEADING)?.[1] ?? '');
		const out = EXITS.test(heading);
		for (const [, attributes] of section.matchAll(CELL)) {
			const name = clean(attributes.match(COMPANY)?.[1] ?? '');
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			const site = unescape(attributes.match(HREF)?.[1] ?? '').trim();
			companies.push({
				name,
				category: out ? 'Exited' : heading,
				url: /^https?:\/\//i.test(site) ? site : PAGE_URL
			});
		}
	}
	if (companies.length === 0) {
		throw new Error('alpaca: no companies on the portfolio page');
	}

	return companies;
}
