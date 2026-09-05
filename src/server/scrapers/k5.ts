import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.k5global.com/companies';
const MAX_PAGES = 30;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, paginated the way northzone's is. every card links to the
// company's own address and names it outright, and two optional lines say
// how the fund's position ended: an "IPO: COIN" ticker or an "Acquired by
// ..." note, both kept as tags. no sectors anywhere.

const ITEM = 'collection-item-2 w-dyn-item';
const NAME = /class="company-title">([^<]*)</;
const SITE = /<a href="(https?:\/\/[^"]+)"/;
const TICKER = /class="ticker-text">([^<]+)</;
const ACQUISITION = /class="acquisition-text">([^<]+)</;
const NEXT = /href="(\?[a-z0-9_]+_page=\d+)"[^>]*class="[^"]*w-pagination-next/;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a note holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

async function fetchPage(url: string) {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let next: string | null = PAGE_URL;

	for (let page = 0; next && page < MAX_PAGES; page++) {
		const html: string = await fetchPage(next);
		let found = 0;
		for (const item of html.split(ITEM).slice(1)) {
			const name = clean(item.match(NAME)?.[1] ?? '');
			if (!name) continue;
			found++;
			if (seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());

			const ticker = tag(item.match(TICKER)?.[1] ?? '');
			const acquisition = tag(item.match(ACQUISITION)?.[1] ?? '');
			companies.push({
				name,
				category: [
					ticker,
					ticker ? 'Public' : '',
					acquisition,
					/acquired|merged/i.test(acquisition) ? 'Exited' : ''
				]
					.filter(Boolean)
					.join(', '),
				url: item.match(SITE)?.[1] ?? ''
			});
		}
		if (found === 0) {
			throw new Error(`k5: ${next} listed no companies`);
		}
		const query = html.match(NEXT)?.[1];
		next = query ? `${PAGE_URL}${query}` : null;
	}
	if (next) {
		throw new Error(`k5: the portfolio still paginated after ${MAX_PAGES} pages`);
	}
	if (companies.length === 0) {
		throw new Error('k5: no companies in the portfolio');
	}

	return companies;
}
