import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://cortado.ventures/portfolio-new/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, divi and essential grid: a tile per company with its name, a line
// about it, its site and its place, its sectors as filter classes on the tile, whose
// buttons give the words for them. "filter-exits" has a button, "filter-acquired"
// and "filter-other" have none: the first says how it ended, the second nothing.
const TILE = /(?=<li id="eg-)/;
const CLASSES = /^<li\b[^>]*\bclass="([^"]*)"/;
const FILTER = /\bfilter-([a-z0-9-]+)/g;
const FULL_NAME = /<h6>\s*<strong>([^<]*)/;
const NAME = /class="eg-invisiblebutton"[^>]*>([^<]*)/;
const SITE = /<a\b[^>]*class="eg-projects-element-12\b[^"]*"[^>]*\bhref="(https?:\/\/[^"]+)"/;
const PLACE = /class="esg-bottom\b[^"]*"[^>]*>([^<]*)/;
const BUTTON = /data-filter="filter-([a-z0-9-]+)"[^>]*>\s*(?:<span>)?\s*([^<]+)/g;
const OUT = new Set(['exits', 'acquired']);

const clean = (s: string) =>
	s
		.replace(/&amp;|&#038;/g, '&')
		.replace(/&#0?39;|&#8217;|&rsquo;/g, "'")
		.replace(/\s+/g, ' ')
		.trim();

// the category is comma-joined, so "Livermore, CA" would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const words = new Map([...html.matchAll(BUTTON)].map(([, slug, word]) => [slug, tag(word)]));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const tile of html.split(TILE).slice(1)) {
		const name = clean(tile.match(FULL_NAME)?.[1] ?? tile.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const filters = [...(tile.match(CLASSES)?.[1] ?? '').matchAll(FILTER)].map(([, slug]) => slug);
		companies.push({
			name,
			category: [
				...filters.filter((slug) => !OUT.has(slug) && words.has(slug)).map((slug) => words.get(slug) as string),
				tag(tile.match(PLACE)?.[1] ?? ''),
				filters.includes('acquired') ? 'Acquired' : '',
				filters.some((slug) => OUT.has(slug)) ? 'Exited' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: tile.match(SITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('cortado: no companies on the portfolio page');
	}

	return companies;
}
