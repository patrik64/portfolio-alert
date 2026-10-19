import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.summitpartners.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
const PACE_MS = 150;
const MAX_PAGES = 20;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio is a collection list of a hundred companies a page,
// the pages chained by a "next" link (?b6676ed8_page=2) that the browser
// follows to load the rest in place. each item links the company's page on
// the fund's site (some send on to the news of the deal), names the company
// in a hidden heading, and carries the sector it is filed under — beside a
// "Sector" placeholder left by the filter's template — a status, "Current"
// or, for a company the fund is out of, "Merger", "IPO" or "Exited", kept
// as written with "Exited" added, and a line about it. the item is repeated
// in a drawer below it, so each field is read from its first copy. no
// company's own site is linked anywhere, so companies link their pages on
// the fund's site. a company backed twice is listed twice and comes once,
// with the newer listing's fields. a run that cannot reach the list's end
// fails rather than store part of it.

const ITEM_START = /(?=<div role="listitem" class="investment-list-item w-dyn-item">)/;
const LINK = /<a\b[^>]*\bhref="(\/companies\/[^"]+)"/;
const NAME = /fs-cmssort-field="name"[^>]*>([\s\S]*?)<\/h3>/;
const STATUS = /fs-cmsfilter-field="status" class="text-m[^"]*">([^<]*)</;
const SECTOR = /fs-cmsfilter-field="sector" class="inline-block[^"]*">([^<]*)</g;
const NEXT = /href="(\?\w+_page=\d+)"[^>]*class="w-pagination-next\b/;
const PLACEHOLDER = /^sector$/i;
const CURRENT = /^current$/i;
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

export async function scrape(): Promise<ScrapedCompany[]> {
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let url: string = PAGE_URL;
	for (let page = 1; ; page++) {
		if (page > MAX_PAGES) {
			throw new Error(`summit: the portfolio runs past ${MAX_PAGES} pages`);
		}
		const resp: Response = await fetch(url, { headers: { 'User-Agent': UA } });
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${url}: ${resp.status}`);
		}
		const html: string = await resp.text();
		const items = html.split(ITEM_START).slice(1);
		if (items.length === 0) {
			throw new Error(`summit: no companies on page ${page} of the portfolio`);
		}
		for (const item of items) {
			const name = clean(item.match(NAME)?.[1] ?? '');
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			const status = clean(item.match(STATUS)?.[1] ?? '');
			const link = unescape(item.match(LINK)?.[1] ?? '').trim();
			companies.push({
				name,
				category: [
					...[...item.matchAll(SECTOR)].map(([, s]) => tag(s)).filter((s) => !PLACEHOLDER.test(s)),
					...(status && !CURRENT.test(status) ? [tag(status), 'Exited'] : [])
				]
					.filter((t, i, all) => t && all.indexOf(t) === i)
					.join(', '),
				url: link ? `${BASE_URL}${link}` : PAGE_URL
			});
		}
		const next = html.match(NEXT)?.[1];
		if (!next) break;
		url = `${PAGE_URL}${unescape(next)}`;
		await wait(PACE_MS);
	}

	if (companies.length === 0) {
		throw new Error('summit: no companies on the portfolio page');
	}
	if (!companies.some((c) => c.category)) {
		throw new Error('summit: the sector and status markers moved');
	}

	return companies;
}
