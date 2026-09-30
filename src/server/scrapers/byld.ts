import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.byld.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio page holds every company as a card that opens
// into a panel — the name under the logo, a link to its site, the fund it
// sits in ("Fund I", or "Pre-BYLD" for what the partners backed before
// there was a fund), and a grid of facts: the year of the investment, its
// type ("Pre-Seed"), where the company is and the category it is filed
// under, beside its founder and its co-investors. a fact the company has
// none of is kept in the page and hidden. the filter runs in the browser,
// so the page holds every card. a few sites are written without their
// scheme. nothing marks an exit.

const ITEM = /(?=<div\b[^>]*\bclass="[^"]*\bw-dyn-item\b)/;
const NAME = /class="portfolio_fallback-name[^"]*">([\s\S]*?)<\/div>/;
const LOGO = /<img\b[^>]*\balt="([^"]*)"[^>]*\bclass="portfolio_logo"/;
const SITE = /<a\b(?=[^>]*\baria-label="company website")[^>]*\bhref="([^"]*)"/;
const FUND = /<div fs-cmsfilter-field="category"[^>]*>([\s\S]*?)<\/div>/;
// a fact of the grid: whether it shows, its heading, and what it says
const FACT =
	/<div\b[^>]*\bclass="(potfolio_grid-item[^"]*)"[^>]*>\s*<div class="heading-portfolio-item">([\s\S]*?)<\/div>\s*<div\b[^>]*>([\s\S]*?)<\/div>/g;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

// the rich text fields carry zero-width joiners
const clean = (s: string) =>
	unescape(s.replace(/<[^>]+>/g, ' '))
		.replace(/[​-‏⁠﻿]/g, '')
		.replace(/\s+/g, ' ')
		.trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// "www.coloop.ai" is a site too
const site = (raw: string) => {
	const address = unescape(raw).trim();
	if (!address || address === '#') return '';
	return /^https?:\/\//i.test(address) ? address : `https://${address}`;
};

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const name = clean(item.match(NAME)?.[1] ?? '') || clean(item.match(LOGO)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const facts = new Map(
			[...item.matchAll(FACT)]
				.filter(([, classes]) => !/\bw-condition-invisible\b/.test(classes))
				.map(([, , heading, value]) => [clean(heading).toLowerCase(), tag(value)])
		);
		const year = facts.get('year of investment')?.match(/\b(?:19|20)\d{2}\b/)?.[0];
		companies.push({
			name,
			category: [
				facts.get('category') ?? '',
				facts.get('location') ?? '',
				tag(item.match(FUND)?.[1] ?? ''),
				facts.get('investment type') ?? '',
				year ? `Invested ${year}` : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: site(item.match(SITE)?.[1] ?? '') || PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('byld: no companies on the portfolio page');
	}

	return companies;
}
