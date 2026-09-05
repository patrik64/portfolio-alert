import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.thirdprime.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// static webflow, the whole list in the html. each card names the company,
// says what it does and links its site.
//
// the page offers sector filters, but the cards themselves carry no sector —
// only a status, whose "Realized" is this fund's word for an exit. "Active"
// is what everything else reads and says nothing.

const ITEM = 'class="portoflio-item w-dyn-item"';
const NAME = /class="portfolio-headline[^"]*">([^<]*)</;
const SITE = /<a href="(https?:\/\/[^"]+)"/;
const STATUS = /fs-cmsfilter-field="status"[^>]*>([^<]*)</;

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const name = (item.match(NAME)?.[1] ?? '').trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);
		const status = (item.match(STATUS)?.[1] ?? '').trim();
		companies.push({
			name,
			category: /^realized$/i.test(status) ? 'Exited' : '',
			url: item.match(SITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('thirdprime: no companies on the portfolio page');
	}

	return companies;
}
