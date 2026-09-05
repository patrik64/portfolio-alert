import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.1011vc.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// static webflow, whole list in the html. a card names the company, says what
// stage the fund is in with it, and carries a status — "Active" for a company
// still held, "Acquired" or "IPO" for one that has left.
//
// the cards link only to the fund's own write-ups, never to the companies.

const ITEM = 'class="companies-list_item w-dyn-item"';
const NAME = /fs-list-field="name"[^>]*>[\s\S]{0,400}?>([^<]+)</;
const STATUS = /fs-list-field="status"[^>]*>([^<]*)</;
const STAGE = /fs-list-field="stage"[^>]*>([^<]*)</;
const SLUG = /href="\/portfolio\/([^"]+)"/;

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
		const slug = item.match(SLUG)?.[1] ?? '';
		companies.push({
			name,
			category: [
				(item.match(STAGE)?.[1] ?? '').trim(),
				// "Active" is what a company still held reads
				/^active$/i.test(status) ? '' : /^ipo$/i.test(status) ? 'Exited' : status
			]
				.filter(Boolean)
				.join(', '),
			url: slug ? `${PAGE_URL}/${slug}` : ''
		});
	}

	if (companies.length === 0) {
		throw new Error('teneleven: no companies on the portfolio page');
	}

	return companies;
}
