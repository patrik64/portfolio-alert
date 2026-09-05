import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.inspiredcapital.com/portfolio';
const MAX_PAGES = 30;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, paginated the way northzone's is, a dozen and a half cards per
// page. every card names its company in the sort field the site's own
// ordering reads and files it under tag pills — sector, audience, stage —
// which together make the category. the cards link nowhere off the site:
// the companies go in without addresses.

const ITEM = 'portfolio_cms_item w-dyn-item';
const NAME = /data-sort-name-visible[^>]*>([^<]*)</;
const TAG = /class="tag-main-text">([^<]+)</g;
const NEXT = /href="(\?[a-z0-9_]+_page=\d+)"[^>]*class="[^"]*w-pagination-next/;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();
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

			const tags = new Set([...item.matchAll(TAG)].map((m) => tag(m[1])).filter(Boolean));
			tags.delete(name);
			companies.push({ name, category: [...tags].join(', '), url: '' });
		}
		if (found === 0) {
			throw new Error(`inspired: ${next} listed no companies`);
		}
		const query = html.match(NEXT)?.[1];
		next = query ? `${PAGE_URL}${query}` : null;
	}
	if (next) {
		throw new Error(`inspired: the portfolio still paginated after ${MAX_PAGES} pages`);
	}
	if (companies.length === 0) {
		throw new Error('inspired: no companies in the portfolio');
	}

	return companies;
}
