import type { ScrapedCompany } from './types';

const BASE_URL = 'https://matrix.vc/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MAX_PAGES = 20;

// webflow. the portfolio is on the fund's one page, a hundred to a page with a
// Next link the browser follows on its own, so the pages are walked here.
//
// the page also carries the team, whose cards are listitems of the same kind
// and each of which lists the companies that partner backed. so the list is
// taken by the name webflow gives it — the one the filter is bound to — rather
// than by what its rows look like, and the team is left alone.
//
// what a company is filed under and what became of it are the same field here:
// a row carries Infrastructure or FinTech, and Acquired or IPO beside it where
// that has happened. they are the fund's own filter values and are kept as
// they come, in the order the fund lists them.
//
// a company that has been bought is often linked to the story of it rather
// than to itself — Zong to ebay's announcement, Plexxi to network computing —
// which is the address the fund publishes, and safe to keep here because the
// name is written on the page rather than read out of the link.

const LIST = /<div[^>]*\bfs-list-element="list"[^>]*>([\s\S]*?)(?=<\/div>\s*<\/div>\s*<div class="w-pagination-wrapper|$)/;
const ROW = /(?=<div[^>]*role="listitem" class="collection-item)/;
const NAME = /<a href="([^"]*)"[^>]*class="text-size-large">([\s\S]*?)<\/a>/;
const LABEL = /fs-list-field="category">([\s\S]*?)<\/div>/g;
const NEXT = /<a href="(\?[^"]*_page=\d+)"[^>]*class="[^"]*w-pagination-next/;

const clean = (s: string) =>
	s
		.replace(/<[^>]+>/g, ' ')
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;|&#8220;|&#8221;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();

	let next: string | undefined = BASE_URL;
	for (let page = 1; next && page <= MAX_PAGES; page++) {
		const html: string = await fetchText(next);

		const list = html.match(LIST)?.[1];
		if (!list) {
			throw new Error('matrix: the page no longer carries its list of investments');
		}

		for (const row of list.split(ROW)) {
			const named = row.match(NAME);
			const name = clean(named?.[2] ?? '');
			if (!name || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());

			companies.push({
				name,
				category: [...row.matchAll(LABEL)].map((label) => clean(label[1])).filter(Boolean).join(', '),
				url: named?.[1] ?? ''
			});
		}

		const following = html.match(NEXT)?.[1];
		next = following ? `${BASE_URL}${following}` : undefined;
	}

	if (companies.length === 0) {
		throw new Error('matrix: no companies among the investments');
	}

	return companies;
}
