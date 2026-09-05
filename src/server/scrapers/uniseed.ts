import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.uniseed.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// static webflow, written as two runs of cards under their own headings —
// "Exited" first, then "Current portfolio" — with no markup telling one run
// from the other, so a card belongs to whichever heading it follows.
//
// the fund publishes no sectors and links no company sites, so a company's
// standing is the whole of its category, and every row comes back without a
// url. two cards read "Yet to be announced…" and name nobody.

const NAME = /class="text-style-h5">([^<]*)</g;
const CURRENT = />Current portfolio</;

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const currentAt = html.search(CURRENT);
	if (currentAt < 0) {
		throw new Error('uniseed: the portfolio no longer separates exits from holdings');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const m of html.matchAll(NAME)) {
		const name = m[1].trim();
		if (!name || /^yet to be announced/i.test(name) || seen.has(name)) continue;
		seen.add(name);
		companies.push({
			name,
			category: m.index < currentAt ? 'Exited' : '',
			url: ''
		});
	}

	if (companies.length === 0) {
		throw new Error('uniseed: no companies on the portfolio page');
	}

	return companies;
}
