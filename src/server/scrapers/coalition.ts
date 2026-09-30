import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.coalitionoperators.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio is a grid of logos linking the companies' sites,
// each opening a panel with the name, a line about it, the year the fund
// invested and the industries the filter reads. the filter runs in the
// browser, so the page holds every company. nothing marks an exit.

const ITEM = /(?=<div\b[^>]*\bclass="portfolio-list-item-wrapper\b)/;
const NAME = /class="portfolio-company-name"[^>]*>([\s\S]*?)<\/div>/;
const SITE = /<a\b[^>]*\bhref="([^"]*)"/;
const YEAR = />\s*Invested in\s*<\/p>\s*<p\b[^>]*>([\s\S]*?)<\/p>/i;
const INDUSTRY = /fs-cmsfilter-field="industry"[^>]*>([\s\S]*?)<\/p>/g;
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
	// the filters come after the list and name the industries the same way
	const html = (await resp.text()).split(/<div\b[^>]*\bclass="portfolio-filters-cnt\b/)[0];

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const name = clean(item.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const year = clean(item.match(YEAR)?.[1] ?? '').match(/\b(?:19|20)\d{2}\b/)?.[0];
		const site = unescape(item.match(SITE)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [
				...[...item.matchAll(INDUSTRY)].map(([, industry]) => tag(industry)),
				year ? `Invested ${year}` : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('coalition: no companies on the portfolio page');
	}

	return companies;
}
