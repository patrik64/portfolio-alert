import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.e14.vc/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MAX_PAGES = 20;

// webflow, paginated at a hundred cards a page behind ?5da46b9a_page=N. a card
// shows a logo, and names the company in a link the page keeps hidden — the
// one that leads to the fund's own write-up — while linking the company's own
// site from the card itself.
//
// each card also carries a label that webflow hides unless it applies; where
// it shows, it says the company has been acquired.

const CARD = /(?=<a href="\/companies\/[^"]+" class="display-none w-inline-block">)/;
const NAME = /class="display-none w-inline-block"><div>([^<]*)</;
const LABEL = /card-company_label-wrapper([^"]*)"[\s\S]{0,400}?>([^<]{2,40})</;
const SITE = /href="(https?:\/\/[^"]+)"/g;

export async function scrape(): Promise<ScrapedCompany[]> {
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();

	for (let page = 1; page <= MAX_PAGES; page++) {
		const url = page === 1 ? PAGE_URL : `${PAGE_URL}?5da46b9a_page=${page}`;
		const resp = await fetch(url, { headers: { 'User-Agent': UA } });
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${url}: ${resp.status}`);
		}
		const html = await resp.text();

		const cards = html.split(CARD).slice(1);
		if (cards.length === 0) break;

		let fresh = 0;
		for (const card of cards) {
			const name = (card.match(NAME)?.[1] ?? '').trim();
			if (!name || seen.has(name)) continue;
			seen.add(name);
			fresh++;

			const label = card.match(LABEL);
			const status =
				label && !label[1].includes('w-condition-invisible') ? label[2].trim() : '';

			companies.push({
				name,
				category: status,
				url:
					[...card.slice(0, 4000).matchAll(SITE)]
						.map((m) => m[1])
						.find((link) => !/e14\.vc|website-files|webflow/.test(link)) ?? ''
			});
		}
		// the last page keeps answering with the same cards
		if (fresh === 0) break;
	}

	if (companies.length === 0) {
		throw new Error('e14: no companies on the companies page');
	}

	return companies;
}
