import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.baincapitallifesciences.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
// the list the portfolio page asks its site for when its filters change
const DATA_URL = `${BASE_URL}/bcajaxdata`;
const MAX_PAGES = 40;
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
// no company page is begun past this, leaving the run its time
const DEADLINE_MS = 150_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// drupal: the portfolio page is a grid of logos the page redraws from its
// site's own list when its filters change — a company each with its name,
// the year the fund invested, the theme it was made under ("Growth
// Capital", "Fallen Angels", "Private Equity"), whether it is held
// ("Active") or "Former", and its page here, which gives its site. the
// list is read as the page asks for it, unfiltered, every page of it. the
// theme and the year are kept as tags, a former holding with the Exited
// tag. a company page that will not load, or is not reached by the
// deadline, leaves its company linking it.

const SITE = /<div class="portfolio-link">\s*<a\b[^>]*\bhref="([^"]*)"/;
const FORMER = /^former$/i;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

interface Record {
	label?: string;
	slug?: string;
	PortfolioYear?: string | null;
	portfoliostatus_label?: string | null;
	buthemes_label?: string | null;
}

interface Listing {
	data?: Record[];
	page_count?: number | string;
}

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
async function get(url: string, init: RequestInit = {}): Promise<Response> {
	const options = { ...init, headers: { 'User-Agent': UA, ...init.headers } };
	const resp = await fetch(url, options);
	if (resp.status !== 429) return resp;
	await resp.body?.cancel();
	await wait(REFUSED_MS);
	return fetch(url, options);
}

// a page of the list, as the portfolio page asks for it with no filter set
async function listing(page: number): Promise<Listing> {
	const body = new URLSearchParams({
		action: 'portfolio_listing',
		statusID: 'all',
		verticalID: 'all',
		sortByValue: 'alphabetical',
		search_by: '',
		page: String(page)
	});
	const resp = await get(DATA_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
		body
	});
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${DATA_URL} (page ${page}): ${resp.status}`);
	}
	return resp.json();
}

// a company page's site, or nothing when it will not load
async function siteOf(href: string): Promise<string> {
	try {
		const resp = await get(href);
		if (!resp.ok) {
			await resp.body?.cancel();
			return '';
		}
		const site = unescape((await resp.text()).match(SITE)?.[1] ?? '').trim();
		return /^https?:\/\//i.test(site) ? site : '';
	} catch {
		return '';
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const started = Date.now();

	// the whole list, a page at a time; a part of it must not pass for the whole
	const records: Record[] = [];
	for (let page = 1, pages = 1; page <= pages && page <= MAX_PAGES; page++) {
		const list: Listing = await listing(page);
		records.push(...(list.data ?? []));
		pages = Number(list.page_count) || 1;
	}
	if (records.length === 0) {
		throw new Error("bainlifesciences: the portfolio's list came back empty — the endpoint moved");
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const record of records) {
		const name = clean(record?.label ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const href = record.slug ? new URL(record.slug, BASE_URL).href : '';
		const reached = !!href && Date.now() - started < DEADLINE_MS;
		if (reached && companies.length > 0) await wait(PACE_MS);
		const site = reached ? await siteOf(href) : '';
		if (site) withSite++;
		const year = String(record.PortfolioYear ?? '').match(/\b(?:19|20)\d{2}\b/)?.[0];
		companies.push({
			name,
			category: [
				tag(record.buthemes_label ?? ''),
				year ? `Invested ${year}` : '',
				FORMER.test(clean(record.portfoliostatus_label ?? '')) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: site || href || PAGE_URL
		});
	}

	// without the company pages every company would link its page here
	if (withSite === 0) {
		throw new Error("bainlifesciences: no company page gave its site — the pages' markup moved");
	}

	return companies;
}
