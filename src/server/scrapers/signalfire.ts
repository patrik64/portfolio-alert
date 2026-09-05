import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.signalfire.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MAX_PAGES = 20;

// webflow with finsweet paging. the browser is meant to fetch every page and
// stitch them together, so the server renders a hundred at a time and offers a
// next link; that link is followed until there is none.
//
// each row names the company, links to it, lists the sectors it is filed
// under, says which round the fund came in at, and whether it is still held.

const ITEM = '<div role="listitem" class="portfolio-item_wrapper w-dyn-item">';
const NAME = /<h2 class="heading-style-h3">([^<]*)<\/h2>/;
const SITE = /<a rel="noopener noreferrer" href="([^"]*)"/;
const SECTOR = /fs-list-field="sector" class="text-size-medium">([^<]*)<\/p>/g;
const STAGE = /<strong>Partner Since<\/strong>[\s\S]*?<p class="text-size-medium">([^<]*)<\/p>/;
const STATUS = />Status<\/p><p class="text-size-medium">([^<]*)<\/p>/;
const NEXT = /<a href="\?([^"]+)"[^>]*class="w-pagination-next"/;
// "Current" is what a company still held reads
const HELD = /^current$/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();

	let next: string | null = PAGE_URL;
	for (let page = 0; page < MAX_PAGES && next; page++) {
		const resp = await fetch(next, { headers: { 'User-Agent': UA } });
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${next}: ${resp.status}`);
		}
		const html: string = await resp.text();

		let added = 0;
		for (const item of html.split(ITEM).slice(1)) {
			const name = clean(item.match(NAME)?.[1] ?? '');
			if (!name || seen.has(name)) continue;
			seen.add(name);
			added++;

			const status = clean(item.match(STATUS)?.[1] ?? '');
			companies.push({
				name,
				category: [
					...[...item.matchAll(SECTOR)].map((m) => clean(m[1])),
					clean(item.match(STAGE)?.[1] ?? ''),
					HELD.test(status) ? '' : status
				]
					.filter(Boolean)
					.join(', '),
				url: item.match(SITE)?.[1] ?? ''
			});
		}

		const query = html.match(NEXT)?.[1];
		next = query && added > 0 ? `${PAGE_URL}?${query}` : null;
	}

	if (companies.length === 0) {
		throw new Error('signalfire: no companies on the portfolio page');
	}

	return companies;
}
