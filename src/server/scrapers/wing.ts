import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.wing.vc/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MAX_PAGES = 20;

// the webflow list is paginated 25 cards at a time via ?9a5de69c_page=N. each
// card links straight to the company site and fills four fs-list fields: the
// name, one or more sectors, the round the fund came in at, and a status.
//
// "Private" is the status every company that has neither exited nor grown into
// a unicorn carries, and "Wing Companies" the type every company that is not
// prior work carries — neither says anything, so neither becomes a tag.

const SKIP = /^(private|wing companies|n\/a)$/i;

// categories are stored as a comma-separated list of tags, so a sector whose
// own name contains commas ("Agents, Apps, and AI-Native Industries") would
// break into three tags that name nothing. its commas become slashes instead,
// keeping it one tag the search can match whole
const oneTag = (tag: string) => tag.replace(/,\s*(?:and\s+)?/g, ' / ').trim();

const field = (card: string, name: string) =>
	(card.match(new RegExp(`fs-list-field="${name}"[^>]*>([^<]*)<`))?.[1] ?? '').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();

	for (let page = 1; page <= MAX_PAGES; page++) {
		const url = page === 1 ? PAGE_URL : `${PAGE_URL}?9a5de69c_page=${page}`;
		const resp = await fetch(url, { headers: { 'User-Agent': UA } });
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${url}: ${resp.status}`);
		}
		const html = await resp.text();

		let found = 0;
		for (const card of html
			.split('class="portfolio_main_cms_item portfolio_grid w-dyn-item"')
			.slice(1)) {
			found++;
			const name = field(card, 'name');
			if (!name || seen.has(name)) continue;
			seen.add(name);

			// a card's sectors are a nested collection list, so it may hold several
			const sectors = [...card.matchAll(/fs-list-field="category"[^>]*>([^<]*)</g)]
				.map((m) => m[1].trim())
				.filter(Boolean);
			const status = field(card, 'status');
			const tags = [
				...sectors,
				field(card, 'invest'),
				field(card, 'type'),
				// the site marks a public listing "IPO"; both it and an acquisition
				// mean the company has left the portfolio
				/^ipo$/i.test(status) ? 'Exited' : status
			]
				.filter((tag) => tag && !SKIP.test(tag))
				.map(oneTag);

			companies.push({
				name,
				category: tags.join(', '),
				url: card.match(/<a href="(https?:\/\/[^"]+)"[^>]*class="portfolio_main_cms_link/)?.[1] ?? ''
			});
		}

		// the last page still renders the pagination wrapper, so an empty one ends it
		if (found === 0) break;
	}

	if (companies.length === 0) {
		throw new Error('wing: no companies on the portfolio page');
	}

	return companies;
}
