import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.basisset.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio page is a list served whole, a row a company —
// its name, a line about it and the theme it is filed under ("Automated
// Workflows", "Autonomy") — each linking the company's page on the fund's
// site, where its own site is the "Learn more about" button. the page
// carries the list five times, once a tab, so a company's second row is
// passed over; a third of the rows are stealth companies, named only
// "Stealth", and are left out. the pages are fetched one at a time, and a
// page that will not load leaves its company linking to it. nothing marks
// an exit.

const ROW = /(?=<div\b[^>]*\brole="listitem"[^>]*\bclass="portfolio-list_item w-dyn-item")/;
const NAME = /class="company_name"[^>]*>([\s\S]*?)<\/h1>/;
const THEME = /class="category"[^>]*>([\s\S]*?)<\/div>/;
const PAGE = /<a\b[^>]*\bhref="(\/portfolio-companies\/[^"]+)"/;
const SITE = /<a\b[^>]*\bhref="([^"]*)"[^>]*\bclass="link-btn\b/;
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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// the company's site, from its page on the fund's site, or nothing when
// the page will not load; a refusal is waited out once
async function siteOf(page: string): Promise<string> {
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const resp = await fetch(page, { headers: { 'User-Agent': UA } });
			if (resp.status === 429 && attempt === 0) {
				await resp.body?.cancel();
				await wait(REFUSED_MS);
				continue;
			}
			if (!resp.ok) return '';
			const site = unescape((await resp.text()).match(SITE)?.[1] ?? '').trim();
			return /^https?:\/\//i.test(site) ? site : '';
		} catch {
			return '';
		}
	}
	return '';
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const row of html.split(ROW).slice(1)) {
		const name = clean(row.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const path = unescape(row.match(PAGE)?.[1] ?? '').trim();
		const page = path ? `${BASE_URL}${path}` : '';
		if (page) await wait(PACE_MS);
		const site = page ? await siteOf(page) : '';
		companies.push({ name, category: tag(row.match(THEME)?.[1] ?? ''), url: site || page || PAGE_URL });
	}
	if (companies.length === 0) {
		throw new Error('basisset: no companies on the portfolio page');
	}

	return companies;
}
