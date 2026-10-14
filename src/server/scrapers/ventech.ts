import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.ventechvc.com';
const PAGE_URL = `${BASE_URL}/our-companies`;
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
// no company page is begun past this, leaving the run its time
const DEADLINE_MS = 150_000;
const MAX_PAGES = 30;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: "all companies" is a table, fifty rows a page (?ad3019f8_page=2),
// a row a company linking its page here, with its name, its sectors ("B2B
// Software", "Vertical Solutions"), its status ("Active", "Exited"), its
// country and, for one backed from the impact fund, an "AFI VENTURES"
// label. a company's page adds the stage the fund came in at ("Series A")
// — or, for some it is out of, the way out, "IPO" or "Trade Sale" — and
// its site, under "Visit website". the sectors, the country, the stage and
// the impact fund are kept as tags, a listing as IPO, an exit with the
// Exited tag; a trade sale says no more than the exit does. every
// page of the table must load; a company page that will not, or is not
// reached by the deadline, leaves its company linking it.

const ROW = /<a\b[^>]*href="(\/our-companies\/[^"]+)" class="all_companies_item\b[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
const NAME = /class="all_companies_item_name">([\s\S]*?)<\/div>/;
const LABEL = /class="g_tag_wrap"><div class="btn_main_text">([\s\S]*?)<\/div>/;
const FIELD = (name: string) => new RegExp(`fs-cmsfilter-field="${name}">([^<]*)<`, 'g');
const NEXT = /<a href="(\?\w+_page=\d+)"[^>]*class="w-pagination-next\b/;
// a company page's facts: a label and its value
const FACT = /<p>([^<]+)<\/p><\/div><div\b[^>]*class="u-text-main"><p>([^<]*)<\/p>/g;
const SITE = /<a href="([^"]*)" class="w-inline-block">(?:(?!<\/a>)[\s\S])*?Visit website/i;
const EXITED = /^exited$/i;
// a way out written where the stage goes
const TRADE_SALE = /^trade sale$/i;
const IPO = /^ipo$/i;
// the impact fund's label, as the site names the fund
const AFI = /^afi ventures$/i;
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
	stage: string;
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
		const facts = new Map([...html.matchAll(FACT)].map(([, label, value]) => [clean(label).toLowerCase(), clean(value)]));
		const site = unescape(html.match(SITE)?.[1] ?? '').trim();
		return { site: /^https?:\/\//i.test(site) ? site : '', stage: facts.get('stage') ?? '' };
	} catch {
		return null;
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const started = Date.now();

	// the whole table, a page at a time; a part of it must not pass for the whole
	const rows: [string, string][] = [];
	for (let path: string | undefined = '', page = 0; path !== undefined && page < MAX_PAGES; page++) {
		const url = `${PAGE_URL}${path}`;
		const resp = await get(url);
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${url}: ${resp.status}`);
		}
		const html = await resp.text();
		rows.push(...[...html.matchAll(ROW)].map(([, href, body]) => [href, body] as [string, string]));
		path = html.match(NEXT)?.[1];
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const [path, row] of rows) {
		const name = clean(row.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const href = `${BASE_URL}${unescape(path)}`;
		const reached = Date.now() - started < DEADLINE_MS;
		if (reached && companies.length > 0) await wait(PACE_MS);
		const page = reached ? await pageOf(href) : null;
		if (page?.site) withSite++;
		const field = (key: string) => [...row.matchAll(FIELD(key))].map(([, value]) => tag(value));
		const label = clean(row.match(LABEL)?.[1] ?? '');
		companies.push({
			name,
			category: [
				...field('sector'),
				...field('location'),
				TRADE_SALE.test(page?.stage ?? '') ? '' : IPO.test(page?.stage ?? '') ? 'IPO' : tag(page?.stage ?? ''),
				AFI.test(label) ? 'AFI Ventures' : '',
				field('status').some((status) => EXITED.test(status)) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: page?.site || href
		});
	}

	if (companies.length === 0) {
		throw new Error('ventech: no companies in the table — the markup moved');
	}
	// without the company pages every company would link its page here
	if (withSite === 0) {
		throw new Error("ventech: no company page gave its site — the pages' markup moved");
	}

	return companies;
}
