import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.actoneventures.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// framer: the portfolio page is a run of grids under the fund's theses
// ("Powering Agents", "The Newly-Imagined") and "Earlier Investments",
// each tile linking the company's site and naming it under a label for
// what it does ("Agent Payments"), with a row below that says "Acquired"
// on the ones the fund is out of. the heading and the label are kept as
// tags, as written.

const HEADING = /<h2\b[^>]*>([\s\S]*?)<\/h2>/g;
const TILE = /<a\b[^>]*\bdata-framer-name="Company Tile"[^>]*>([\s\S]*?)<\/a>/g;
const HREF = /\bhref="([^"]*)"/;
const NAME = /<h3\b[^>]*>([\s\S]*?)<\/h3>/;
const LABEL = /data-framer-name="Tile Top"[\s\S]*?<p\b[^>]*>([\s\S]*?)<\/p>/;
const META = /data-framer-name="Meta Row"[^>]*>([\s\S]*)$/;
const OUT = /\b(?:acquired|ipo|merged|exited)\b/i;
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
	const headings = [...html.matchAll(HEADING)].map((m) => ({ at: m.index ?? 0, text: tag(m[1]) }));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const tile of html.matchAll(TILE)) {
		const body = tile[1];
		const name = clean(body.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const heading = headings.filter(({ at }) => at < (tile.index ?? 0)).at(-1)?.text ?? '';
		const meta = clean(body.match(META)?.[1] ?? '');
		const out = OUT.test(meta);
		const site = unescape(tile[0].match(HREF)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [heading, tag(body.match(LABEL)?.[1] ?? ''), out ? tag(meta) : '', out ? 'Exited' : '']
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('actone: no company tiles on the portfolio page');
	}

	return companies;
}
