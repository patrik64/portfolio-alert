import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.onewayvc.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BATCH_SIZE = 8;

// webflow, the portfolio a table served whole — no paging, no load more. a row
// carries the name, what the fund files the company under, the stage it came
// in at, the year, and a label for a company that has since gone.
//
// the page holds two cms lists: the filter buttons above the table and the
// table itself. only the second is read, by the class the fund's filtering
// puts on its rows.
//
// a row links to the fund's page for the company rather than to the company,
// and the company's own address is printed on that page — so the pages are
// read too, and each is opened at the heading rather than searched whole,
// since the same markup wraps every link in the site's own menus. three
// companies point at a cb insights profile instead, all of them acquired and
// off the web; that is the address the fund publishes for them, so that is
// what they keep. a page that cannot be reached leaves the company pointing at
// the fund's page for it, which is where the row points.
//
// the year the fund came in is the shape of the investment rather than
// anything about the company, and a year is not a name to file one under, so
// it is left out. the label is kept in the fund's own words: unlike most, this
// one says which kind of exit it was — Acquired, Exited, IPO — and collapsing
// the three would lose what it went to the trouble of saying.

const LIST = 'collection-list-filter w-dyn-items';
const ITEM = 'fs-cmsfilter-showquery="true" role="listitem" class="w-dyn-item"';
const NAME = /<h2[^>]*class="h2-portfolio name">([\s\S]*?)<\/h2>/;
const PAGE = /<a [^>]*href="(\/portfolios\/[^"]+)"/;
const LABEL = /class="text-block-7[^"]*">([\s\S]*?)<\/div>/;
const CATEGORY = /class="table-data category">([\s\S]*?)<\/div>/;
const STAGE = /class="table-data investment">([\s\S]*?)<\/div>/;
// the company's own address, the first link under the heading its page opens on
const SITE =
	/<h1[^>]*class="heading-h1[^"]*"[\s\S]{0,800}?class="link-hover-block"[\s\S]{0,200}?<a\s[^>]*href="(https?:\/\/[^"]+)"/;

// the fund typed the pre-seed stage with cyrillic е in it. it reads Pre-Seed
// and sorts as something else, so a reader looking for the stage would never
// find it. the cyrillic letters that have a latin twin are put back, leaving a
// tag as the word it already looks like
const CYRILLIC = 'аеорсухАВЕКМНОРСТХ';
const LATIN = 'aeopcyxABEKMHOPCTX';

const un = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => un(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a tag written with a comma in it would read
// as two rather than one. a name is left in whatever letters the fund wrote it
// with; only the tags, which come from a list the fund keeps, are put back
const tag = (s: string) =>
	clean(s)
		.replace(/[Ѐ-ӿ]/g, (letter) => {
			const at = CYRILLIC.indexOf(letter);
			return at === -1 ? letter : LATIN[at];
		})
		.replace(/\s*,\s*/g, ' / ');

const field = (item: string, pattern: RegExp) => clean(item.match(pattern)?.[1] ?? '');

async function fetchSite(path: string): Promise<string> {
	const url = `${BASE_URL}${path}`;
	try {
		const resp = await fetch(url, { headers: { 'User-Agent': UA } });
		if (!resp.ok) return url;
		return clean((await resp.text()).match(SITE)?.[1] ?? '') || url;
	} catch {
		return url;
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const at = html.indexOf(LIST);
	const items = at === -1 ? [] : html.slice(at).split(ITEM).slice(1);
	if (items.length === 0) {
		throw new Error('oneway: the portfolio table is no longer written into the page');
	}

	const found: { name: string; category: string; path: string }[] = [];
	const seen = new Set<string>();
	for (const item of items) {
		const name = field(item, NAME);
		const path = item.match(PAGE)?.[1] ?? '';
		if (!name || !path || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		found.push({
			name,
			category: [field(item, CATEGORY), field(item, STAGE), field(item, LABEL)]
				.map(tag)
				.filter(Boolean)
				.join(', '),
			path
		});
	}

	const companies: ScrapedCompany[] = [];
	for (let start = 0; start < found.length; start += BATCH_SIZE) {
		const batch = found.slice(start, start + BATCH_SIZE);
		const sites = await Promise.all(batch.map((entry) => fetchSite(entry.path)));
		batch.forEach((entry, index) => {
			companies.push({ name: entry.name, category: entry.category, url: sites[index] });
		});
	}

	if (companies.length === 0) {
		throw new Error('oneway: no companies in the portfolio');
	}

	return companies;
}
