import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.ibbventures.de';
const PAGE_URL = `${BASE_URL}/en/portfolio`;
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
// no company page is begun past this, leaving the run its time
const DEADLINE_MS = 150_000;
const MAX_PAGES = 20;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio is a table, a hundred rows a page
// (?7b8d790a_page=2), a row a company linking its page here, with its
// name, a line about it, its industry ("Healthcare", "Software & IT") and
// its status ("Active", "Exited"). a company's page adds the year the fund
// first invested and its site. the industry and the year are kept as tags,
// an exit with the Exited tag. every page of the table must load; a
// company page that will not, or is not reached by the deadline, leaves its
// company linking it.

const ROW = /(?=<div\b[^>]*role="listitem" class="portfolio-collection-item w-dyn-item")/;
const NAME = /class="portfolio-company-name[^"]*">([\s\S]*?)<\/div>/;
const PAGE = /<a href="(\/en\/portfolio\/[^"]+)"/;
const INDUSTRY = /fs-cmsfilter-field="industry"[^>]*>([\s\S]*?)<\/div>/;
const STATUS = /\[status\]<\/div>\s*<div class="portfolio-company-desc">([\s\S]*?)<\/div>/;
const NEXT = /href="(\?\w+_page=\d+)"[^>]*class="w-pagination-next\b/;
const SINCE = /class="portfolio-meta-label">\s*invested since\s*<\/div>[\s\S]*?class="portfolio-meta-value">\s*((?:19|20)\d{2})/i;
const SITE = /class="portfolio-meta-label">\s*website\s*<\/div>\s*<div\b[^>]*>\s*<a href="([^"]*)"/i;
const EXITED = /^exited$/i;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// a page, or a refusal waited out once
async function get(url: string): Promise<Response> {
	const headers = { 'User-Agent': UA };
	const resp = await fetch(url, { headers });
	if (resp.status !== 429) return resp;
	await resp.body?.cancel();
	await wait(REFUSED_MS);
	return fetch(url, { headers });
}

interface Page {
	site: string;
	since?: string;
}

// what a company's page says, or nothing when it will not load
async function pageOf(href: string): Promise<Page | null> {
	try {
		const resp = await get(href);
		if (!resp.ok) {
			await resp.body?.cancel();
			return null;
		}
		const html = await resp.text();
		const site = unescape(html.match(SITE)?.[1] ?? '').trim();
		return { site: /^https?:\/\//i.test(site) ? site : '', since: html.match(SINCE)?.[1] };
	} catch {
		return null;
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const started = Date.now();

	// the whole table, a page at a time; a part of it must not pass for the whole
	const rows: string[] = [];
	for (let path: string | undefined = '', page = 0; path !== undefined && page < MAX_PAGES; page++) {
		const url: string = `${PAGE_URL}${path}`;
		const resp: Response = await get(url);
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${url}: ${resp.status}`);
		}
		const html: string = await resp.text();
		rows.push(...html.split(ROW).slice(1));
		path = html.match(NEXT)?.[1];
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const row of rows) {
		const name = clean(row.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const path = row.match(PAGE)?.[1];
		const href = path ? `${BASE_URL}${unescape(path)}` : '';
		const reached = !!href && Date.now() - started < DEADLINE_MS;
		if (reached && companies.length > 0) await wait(PACE_MS);
		const page = reached ? await pageOf(href) : null;
		if (page?.site) withSite++;
		companies.push({
			name,
			category: [
				tag(row.match(INDUSTRY)?.[1] ?? ''),
				page?.since ? `Invested ${page.since}` : '',
				EXITED.test(clean(row.match(STATUS)?.[1] ?? '')) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: page?.site || href || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('ibb: no companies in the portfolio table — the markup moved');
	}
	// without the company pages every company would link its page here
	if (withSite === 0) {
		throw new Error("ibb: no company page gave its site — the pages' markup moved");
	}

	return companies;
}
