import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.arringtoncapital.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, a theme of its own: the portfolio page is a grid of blocks,
// each the company's name and the tags the filter reads ("DeFi",
// "Infrastructure", "Ethereum"), kept as tags, and behind each block a
// panel served in the page, with a line about the company and a "Visit
// Website" link. nothing marks an exit.

const PANELS = 'class="portfolio-modals"';
const BLOCK = /(?=<div\b[^>]*\bclass="portfolio-block\b)/;
const PANEL = /(?=<div\b[^>]*\bclass="modal-\d+ modal")/;
const NAME = /^<div\b[^>]*\bdata-name="([^"]*)"/;
const SLUG = /^<div\b[^>]*\bdata-slug="([^"]*)"/;
const TAG = /class="post-tag"[^>]*>([\s\S]*?)<\/div>/g;
const WEBSITE = /<a\b(?=[^>]*\bclass="portfolio-website")[^>]*\bhref="([^"]*)"/;
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
	const split = html.indexOf(PANELS);
	const grid = split < 0 ? html : html.slice(0, split);
	const panels = split < 0 ? '' : html.slice(split);

	// each company's site, from its panel, by the slug the block shares
	const sites = new Map<string, string>();
	for (const panel of panels.split(PANEL).slice(1)) {
		const slug = unescape(panel.match(SLUG)?.[1] ?? '');
		const site = unescape(panel.match(WEBSITE)?.[1] ?? '').trim();
		if (slug && /^https?:\/\//i.test(site)) sites.set(slug, site);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const block of grid.split(BLOCK).slice(1)) {
		const name = clean(block.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			category: [...block.matchAll(TAG)]
				.map(([, label]) => tag(label))
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: sites.get(unescape(block.match(SLUG)?.[1] ?? '')) ?? PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('arrington: no companies on the portfolio page');
	}

	return companies;
}
