import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.equal.vc';
const PAGE_URL = `${BASE_URL}/portfolio`;
// the companies' pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio page lists every company as a logo linking its
// page on the fund's site, the name in the logo's alt text — the whole
// collection, which the sitemap agrees with; a second copy of the list for
// phones loads four at a time and is not read. the company's page names it,
// links its site, and files it under sectors ("( Retail )") and a location;
// those pages are fetched for that, and one that will not load leaves its
// company linking to that page. nothing marks an exit.

const ITEM = /(?=<div[^>]*role="listitem"[^>]*class="portfolio-item w-dyn-item")/;
const PAGE = /<a\b[^>]*\bhref="(\/portfolio\/[^"#?]+)"/;
const LOGO = /<img\b[^>]*\balt="([^"]+)"/;
const NAME = /class="portfolio-name-wrapper"[^>]*>\s*<h\d[^>]*>([\s\S]*?)<\/h\d>/;
const SITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*class="[^"]*\blink-to-portfolio\b/;
// "( Retail )", one item per sector; the location follows its own label
const SECTOR = /class="collection-item-6 w-dyn-item"[^>]*>\s*<div class="text-base nowrap"[^>]*>([\s\S]*?)<\/div>/g;
const LOCATION = /class="location"[^>]*>[\s\S]{0,400}?<div class="text-base nowrap"[^>]*>([\s\S]*?)<\/div>/;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two;
// the site writes its labels in brackets
const tag = (s: string) =>
	clean(s)
		.replace(/^\(\s*|\s*\)$/g, '')
		.replace(/\s*,\s*/g, ' / ');

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Detail {
	name: string;
	site: string;
	sectors: string[];
	location: string;
}

// what a company's page says, or nothing when it will not load
async function detailOf(page: string): Promise<Detail | null> {
	try {
		let resp = await fetch(page, { headers: { 'User-Agent': UA } });
		if (resp.status === 429) {
			await wait(20_000);
			resp = await fetch(page, { headers: { 'User-Agent': UA } });
		}
		if (!resp.ok) return null;
		const html = await resp.text();
		return {
			name: clean(html.match(NAME)?.[1] ?? ''),
			site: unescape(html.match(SITE)?.[1] ?? ''),
			sectors: [...html.matchAll(SECTOR)].map((m) => tag(m[1])).filter(Boolean),
			location: tag(html.match(LOCATION)?.[1] ?? '')
		};
	} catch {
		return null;
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const listed = new Map<string, string>();
	for (const item of html.split(ITEM).slice(1)) {
		const path = item.match(PAGE)?.[1];
		const name = clean(item.match(LOGO)?.[1] ?? '');
		if (path && !listed.has(path)) listed.set(path, name);
	}
	if (listed.size === 0) {
		throw new Error('equal: no companies on the portfolio page');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [i, [path, listedName]] of [...listed].entries()) {
		if (i > 0) await wait(PACE_MS);
		const page = `${BASE_URL}${unescape(path)}`;
		const detail = await detailOf(page);
		const name = detail?.name || listedName;
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			category: [...(detail?.sectors ?? []), detail?.location ?? '']
				.filter((t, k, all) => t && all.indexOf(t) === k)
				.join(', '),
			url: detail?.site || page
		});
	}

	return companies;
}
