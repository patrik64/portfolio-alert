import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.jolt-capital.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
// the collection the portfolio page's lists are drawn from, as squarespace serves it
const DATA_URL = `${BASE_URL}/companies?format=json`;
const MAX_PAGES = 40;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace: the portfolio page is two lists, "Current portfolio" and
// "Exits", each a summary of the site's companies collection — a company
// each with its name, a page here linking its site, and categories saying
// which list it is in ("portfolio", "Exit") and which of the fund's
// vehicles holds it ("Jolt IV", "Jolt TOF"). the collection is read whole,
// twenty a page, and a page of it that will not load fails the run. the
// vehicles are kept as tags, an exit with the Exited tag; a company in
// neither list is not on the page and is left out.

const LISTED = /^portfolio$/i;
const EXIT = /^exits?$/i;
const VEHICLE = /^jolt\b/i;
const LINK = /href="(https?:\/\/[^"]+)"/g;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

interface Item {
	title?: string;
	fullUrl?: string;
	categories?: string[];
	body?: string;
}

interface Page {
	items?: Item[];
	pagination?: { nextPage?: boolean; nextPageUrl?: string };
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

export async function scrape(): Promise<ScrapedCompany[]> {
	// the whole collection, a page at a time; a part of it must not pass for the whole
	const items: Item[] = [];
	for (let url: string | undefined = DATA_URL, page = 0; url !== undefined && page < MAX_PAGES; page++) {
		const resp: Response = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${url}: ${resp.status}`);
		}
		const data: Page = await resp.json();
		items.push(...(data.items ?? []));
		const next = data.pagination?.nextPage ? data.pagination.nextPageUrl : undefined;
		url = next ? `${BASE_URL}${next}${next.includes('?') ? '&' : '?'}format=json` : undefined;
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of items) {
		const categories = (item.categories ?? []).map(clean);
		const exited = categories.some((c) => EXIT.test(c));
		if (!exited && !categories.some((c) => LISTED.test(c))) continue;
		const name = clean(item.title ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		// the page's text links the company's site, and nothing else outside the fund's own
		const site = [...(item.body ?? '').matchAll(LINK)]
			.map(([, href]) => unescape(href))
			.find((href) => !/jolt-capital\.com/i.test(href));
		companies.push({
			name,
			category: [...categories.filter((c) => VEHICLE.test(c)).map(tag), exited ? 'Exited' : '']
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: site || (item.fullUrl ? `${BASE_URL}${item.fullUrl}` : PAGE_URL)
		});
	}

	if (companies.length === 0) {
		throw new Error('jolt: the companies collection lists no portfolio — the page moved');
	}

	return companies;
}
