import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.jovono.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js, the whole portfolio in the page's __NEXT_DATA__: every item
// carries the company's name, its own address, the round and year the fund
// came in, and flags for acquisitions and ipos.

// the tag has grown extra attributes on other sites, so any are allowed
const DATA = /<script id="__NEXT_DATA__" type="application\/json"[^>]*>([\s\S]*?)<\/script>/;

interface Item {
	name?: string;
	url?: string;
	investmentSeries?: string;
	investmentYear?: number;
	acquisition?: boolean;
	ipo?: boolean;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const blob = html.match(DATA)?.[1];
	if (!blob) {
		throw new Error('jovono: the page carries no data to read the portfolio from');
	}

	let items: Item[];
	try {
		items =
			(JSON.parse(blob) as { props?: { pageProps?: { items?: Item[] } } }).props?.pageProps
				?.items ?? [];
	} catch {
		throw new Error('jovono: the page data could not be read');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of items) {
		const name = clean(item.name ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({
			name,
			category: [
				tag(item.investmentSeries ?? ''),
				item.investmentYear ? String(item.investmentYear) : '',
				item.acquisition ? 'Exited' : '',
				item.ipo ? 'Public' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: item.url ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('jovono: no companies in the page data');
	}

	return companies;
}
