import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.heartcore.com';
const PAGE_URL = `${BASE_URL}/companies`;
const MAX_PAGES = 20;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio is a table, thirty rows a page behind a "show more"
// link, each row holding the fields the page's filters read — the company,
// its category, its country, a year and its state, "Active" or "Exit" — with
// the logo linking the company's site and the row its page here. a company
// still in stealth is a row named "Stealth" and is left out; one that has come
// out of it keeps a "stealth" address but carries its name. the columns say
// only "Year", so the year is recorded bare; "Other" is the category that
// says nothing.

const ROW = /(?=<div[^>]*role="listitem"[^>]*class="[^"]*portfolio__tr)/;
const field = (name: string) =>
	new RegExp(`fs-cms(?:sort|filter)-field="${name}"[^>]*>([\\s\\S]*?)<\\/div>`, 'g');
const COMPANY = field('company');
const CATEGORY = field('category');
const COUNTRY = field('country');
const YEAR = field('year');
const STATE = field('status');
const SITE = /<a href="(https?:\/\/[^"]+)"[^>]*class="portfolio__logo-link/;
const PAGE = /href="(\/companies\/[^"#?]+)"/;
const NEXT = /href="(\?[a-z0-9_]+_page=\d+)"[^>]*class="[^"]*w-pagination-next/;

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

const all = (re: RegExp, text: string) => [...text.matchAll(re)].map((m) => tag(m[1])).filter(Boolean);

export async function scrape(): Promise<ScrapedCompany[]> {
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();

	let url = PAGE_URL;
	for (let page = 0; page < MAX_PAGES && url; page++) {
		const resp = await fetch(url, { headers: { 'User-Agent': UA } });
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${url}: ${resp.status}`);
		}
		const html = await resp.text();

		for (const row of html.split(ROW).slice(1)) {
			const name = all(COMPANY, row)[0] ?? '';
			if (!name || /^stealth$/i.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			const detail = row.match(PAGE)?.[1];
			companies.push({
				name,
				category: [
					...all(CATEGORY, row).filter((c) => !/^other$/i.test(c)),
					...all(COUNTRY, row),
					...all(YEAR, row),
					all(STATE, row).some((s) => /^exit/i.test(s)) ? 'Exited' : ''
				]
					.filter(Boolean)
					.join(', '),
				url: unescape(row.match(SITE)?.[1] ?? '') || (detail ? `${BASE_URL}${detail}` : '')
			});
		}

		const next = html.match(NEXT)?.[1];
		url = next ? `${PAGE_URL}${next}` : '';
	}

	if (companies.length === 0) {
		throw new Error('heartcore: no companies in the portfolio table');
	}

	return companies;
}
