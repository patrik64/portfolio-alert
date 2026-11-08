import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://ecbf.vc/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the portfolio is a grid of round logos, each linking the fund's
// own page on the company and named in its alt text, with a hidden span the
// page's filter reads — the stage ("Series B"), the sectors, several joined
// by "|||" ("Chemicals & Biotech|||FoodTech & Nutrition"), the country and the
// month invested. the sectors, the stage and the country are kept as tags.
// the quotes above the grid are from founders of companies in it.

const ITEM = /<a\b[^>]*\bhref="([^"]*)"[^>]*\bclass="mn-portfolio-grid__item\b[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
const ALT = /<img\b[^>]*\balt="([^"]*)"/;
const DATA = (field: string) => new RegExp(`\\bdata-${field}="([^"]*)"`);
const SECTORS = DATA('sector-names');
const STAGE = DATA('stage-names');
const COUNTRY = DATA('country');
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
	for (const [, href, item] of html.matchAll(ITEM)) {
		const name = clean(item.match(ALT)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			category: [
				...(item.match(SECTORS)?.[1] ?? '').split('|||').map(tag),
				tag(item.match(STAGE)?.[1] ?? ''),
				tag(item.match(COUNTRY)?.[1] ?? '')
			]
				.filter((t, k, all) => t && all.indexOf(t) === k)
				.join(', '),
			url: unescape(href).trim() || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('ecbf: no companies in the portfolio grid — the markup moved');
	}

	return companies;
}
