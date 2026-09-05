import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://plumalley.co/spv-portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, one collection with the whole portfolio on it: a card per company
// with its name, a paragraph about it and a button to its site. no filters and
// no pagination, so the page is read once.
//
// the fund keeps a second page for its first fund, but every company on it is
// already here — this one is the whole list rather than one vehicle's share of
// it.
//
// the fund files its companies under nothing, and the paragraph it writes
// about each is prose rather than a tag, so the category is left empty rather
// than filled with a line that would read as one long tag.

const ITEM = /class="w-dyn-item"/g;
const NAME = /class="text-heading-3">([^<]*)</;
const SITE = /<a href="(https?:\/\/[^"]*)"[^>]*class="cta-outline-white w-button"/;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = (await resp.text()).replace(/\s+/g, ' ');

	const starts = [...html.matchAll(ITEM)].map((m) => m.index);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [i, at] of starts.entries()) {
		const item = html.slice(at, starts[i + 1] ?? html.length);

		const name = clean(item.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({ name, category: '', url: item.match(SITE)?.[1] ?? '' });
	}

	if (companies.length === 0) {
		throw new Error('plumalley: no companies on the portfolio page');
	}

	return companies;
}
