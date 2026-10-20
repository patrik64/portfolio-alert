import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.speedinvest.com/portfolio';
const MAX_PAGES = 30;
// the pages are asked for one at a time, a pause between them
const PACE_MS = 250;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio is a collection fifty to a page, the last list on
// the page after a featured one paged on its own, walked through webflow's
// own "next" link. every row names the company for finsweet's list filter
// and files, all under the filter's one field, its sectors ("Fintech &
// DeFi"), the fund's programmes it came through ("Growth", "Middle East,
// Africa & Beyond"), "Exits" when the fund is out, and, out of sight, its
// country; the year the fund came in stands on its own. the company's site
// is handed to a script that makes a link of it; a row without one links
// the fund's own page of the company.

const LIST = /class="portfolio-list_wrapper w-dyn-list"/;
const ITEM = /(?=<div fs-list-element="list" role="listitem")/;
const NAME = /fs-list-field="itemTitle"[^>]*>([\s\S]*?)<\/h\d>/;
const YEAR = /fs-list-field="date"[^>]*>([\s\S]*?)<\/div>/;
const TAG = /fs-list-field="portfolio"[^>]*>([\s\S]*?)<\/div>/g;
const COUNTRY = /class="hide">\s*<div fs-list-field="portfolio"[^>]*>([\s\S]*?)<\/div>/;
const SITE = /data-fullurl="([^"]*)"/;
const PROFILE = /href="(\/portfolio\/[^"#?]+)"/;
const NEXT = /href="(\?[a-z0-9_]+_page=\d+)"[^>]*class="[^"]*w-pagination-next/;
const EXITS = /^exits?$/i;
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

export async function scrape(): Promise<ScrapedCompany[]> {
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();

	let url = PAGE_URL;
	for (let page = 0; page < MAX_PAGES && url; page++) {
		if (page > 0) await wait(PACE_MS);
		const resp = await fetch(url, { headers: { 'User-Agent': UA } });
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${url}: ${resp.status}`);
		}
		const html = await resp.text();
		const start = html.search(LIST);
		if (start < 0) {
			throw new Error('speedinvest: no portfolio list in the page — the markup moved');
		}
		const list = html.slice(start);

		for (const item of list.split(ITEM).slice(1)) {
			const name = clean(item.match(NAME)?.[1] ?? '');
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			// the sectors and programmes stand in the row's head, the country hidden in its fold
			const head = item.split(/<nav\b/)[0];
			const kinds = [...head.matchAll(TAG)].map(([, s]) => tag(s));
			const year = clean(item.match(YEAR)?.[1] ?? '').match(/\b(?:19|20)\d{2}\b/)?.[0];
			const site = unescape(item.match(SITE)?.[1] ?? '').trim();
			const profile = item.match(PROFILE)?.[1] ?? '';
			companies.push({
				name,
				category: [
					...kinds.filter((kind) => !EXITS.test(kind)),
					year ? `Invested ${year}` : '',
					tag(item.match(COUNTRY)?.[1] ?? ''),
					kinds.some((kind) => EXITS.test(kind)) ? 'Exited' : ''
				]
					.filter((t, i, all) => t && all.indexOf(t) === i)
					.join(', '),
				url: /^https?:\/\//i.test(site) ? site : profile ? `https://www.speedinvest.com${profile}` : PAGE_URL
			});
		}

		const next = list.match(NEXT)?.[1];
		url = next ? `${PAGE_URL}${unescape(next)}` : '';
	}

	if (companies.length === 0) {
		throw new Error('speedinvest: no companies in the portfolio list');
	}

	return companies;
}
