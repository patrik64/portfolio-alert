import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.windhamcap.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// static webflow: the grid shows logos only, and each card carries a hidden
// popup naming the company, its status and its website — the whole list ships
// in the html, with no pagination.
//
// status is the only field the site publishes besides the website, so it is
// the whole category: "Acquired" as it stands, "IPO" as the house's "Exited",
// and the one "IPO/Acquired" as both. the 23 companies still in the portfolio
// read "Active" behind a w-condition-invisible, and say nothing worth a tag.

const NAME = /<h2 class="h2-medium[^"]*">([^<]*)<\/h2>/;
const STATUS = /class="portfolio-exit-text[^"]*">([^<]*)</;
const SITE = /class="portfolio-popup-label">Website<\/div>\s*<a[^>]*href="(https?:\/\/[^"]+)"/;

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of html.split('class="w-dyn-item"').slice(1)) {
		const name = (card.match(NAME)?.[1] ?? '').trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);

		const tags = (card.match(STATUS)?.[1] ?? '')
			.split('/')
			.map((part) => part.trim())
			.filter((part) => part && !/^active$/i.test(part))
			.map((part) => (/^ipo$/i.test(part) ? 'Exited' : part));

		companies.push({
			name,
			category: tags.join(', '),
			url: card.match(SITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('windham: no companies on the portfolio page');
	}

	return companies;
}
