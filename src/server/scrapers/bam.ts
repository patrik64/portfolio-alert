import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.bam.vc/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the companies page is a wall of tiles served whole, a tile a
// company — its picture and, on hover, its category ("Consumer") and its
// name linking its site. the page carries the wall twice, once a tab, so
// the second copy of a company is passed over. nothing marks an exit.

const TILE = /(?=<div\b[^>]*\brole="listitem"[^>]*\bclass="work-sample w-dyn-item")/;
const CATEGORY = /class="mini-title-link"[^>]*>([\s\S]*?)<\/a>/;
const LINK = /<a\b[^>]*\bhref="([^"]*)"[^>]*\bclass="heading-link\b[^"]*"[^>]*>\s*<h4\b[^>]*>([\s\S]*?)<\/h4>/;
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

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const tile of html.split(TILE).slice(1)) {
		const [, href = '', heading = ''] = tile.match(LINK) ?? [];
		const name = clean(heading);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const site = unescape(href).trim();
		companies.push({
			name,
			category: tag(tile.match(CATEGORY)?.[1] ?? ''),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('bam: no companies on the companies page');
	}

	return companies;
}
