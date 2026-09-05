import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.twineventures.com/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// static webflow: the portfolio is a section of the front page, one card per
// company linking straight out to it, with the sector in a nested list the
// page keeps hidden for its filters (a company may sit in two).
//
// the page's only pagination belongs to the news list further down, so the
// portfolio list is whole as served.
//
// four cards read "Stealth" and then a sector — investments the fund has not
// named — and link nowhere. a company genuinely called Stealth-something would
// have a link, so it is the pair that marks a placeholder, not the word.

const LIST = 'portfolio--list w-dyn-items';
const CARD = /(?=<div role="listitem" class="w-dyn-item"><a )/;
const NAME = /<h3[^>]*>([^<]*)<\/h3>/;
const SITE = /href="(https?:\/\/[^"]+)"/;
const TAG = /fs-cmsfilter-field="tag">([^<]*)</g;

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const at = html.indexOf(LIST);
	if (at < 0) {
		throw new Error('twine: no portfolio list on the page');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of html.slice(at).split(CARD).slice(1)) {
		const name = (card.match(NAME)?.[1] ?? '').trim();
		if (!name || seen.has(name)) continue;
		const url = card.match(SITE)?.[1] ?? '';
		if (!url && /^stealth\b/i.test(name)) continue;
		seen.add(name);
		companies.push({
			name,
			category: [...card.matchAll(TAG)]
				.map((m) => m[1].trim())
				.filter(Boolean)
				.join(', '),
			url
		});
	}

	if (companies.length === 0) {
		throw new Error('twine: no companies in the portfolio list');
	}

	return companies;
}
