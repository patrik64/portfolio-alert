import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://colle.vc/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress with elementor, the grid drawn by a shortcode of the theme's:
// each company is a logo and a line that open a side panel with its ceo,
// its site and a paragraph about it, and carries as classes the sectors
// its filter buttons spell out. the name is nowhere to be seen — the theme
// writes it into the page as a heading and comments the heading out — so
// it is read from there. an exit wears "Acquired By: dLocal" over its logo.
// under the grid, a second one headed "Prior Investments" holds what the
// partners backed before the fund, its companies filed under no sector;
// they are kept, and tagged as such.

const ITEM = /(?=<div\b[^>]*\bclass="as-portfolio-item\b)/;
const NAME = /<!--\s*<h3\b[^>]*>([\s\S]*?)<\/h3>\s*-->/;
const CLASSES = /^<div\b[^>]*\bclass="([^"]*)"/;
const SITE = /<a\b(?=[^>]*\bclass="as-port-globe")[^>]*\bhref="([^"]*)"/;
const ACQUIRED = /class="as-acq">([\s\S]*?)<\//;
// a filter: the class the companies carry, and how it is spelled out
const FILTER = /<li\b[^>]*\bdata-filter="\.([^"]+)"[^>]*>([\s\S]*?)<\/li>/g;
const PRIOR = /<h2\b[^>]*>\s*Prior Investments\s*<\/h2>/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
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

	const sectors = new Map([...html.matchAll(FILTER)].map(([, slug, label]) => [slug, tag(label)]));
	const split = html.search(PRIOR);
	const grids = split < 0 ? [html] : [html.slice(0, split), html.slice(split)];

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	grids.forEach((grid, index) => {
		const prior = index === 1;
		for (const item of grid.split(ITEM).slice(1)) {
			const name = clean(item.match(NAME)?.[1] ?? '');
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			const classes = item.match(CLASSES)?.[1].split(/\s+/) ?? [];
			// "Acquired By: dLocal"
			const acquired = clean(item.match(ACQUIRED)?.[1] ?? '').replace(/^acquired by:?\s*/i, '');
			const site = unescape(item.match(SITE)?.[1] ?? '').trim();
			companies.push({
				name,
				category: [
					...classes.map((c) => sectors.get(c) ?? '').filter((t) => !/^other$/i.test(t)),
					prior ? 'Prior Investment' : '',
					acquired ? `Acquired by ${tag(acquired)}` : '',
					acquired ? 'Exited' : ''
				]
					.filter((t, i, all) => t && all.indexOf(t) === i)
					.join(', '),
				url: /^https?:\/\//i.test(site) ? site : PAGE_URL
			});
		}
	});
	if (companies.length === 0) {
		throw new Error('colle: no companies on the portfolio page');
	}

	return companies;
}
