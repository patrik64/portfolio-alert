import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.shrug.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// static webflow, the whole list in the html. each row names the company,
// links to it, and sits under one of the fund's own headings.
//
// those headings are kept as the fund writes them, jokes included — "Obligatory
// AI Section", "(Lonely) Enterprise", "Social is hard...", and a "Non-Shrug"
// group for the four the fund backed outside the fund. rewriting them into
// tidier sectors would be inventing a taxonomy the fund does not use.
//
// no exits are marked.

const ITEM =
	/<div role="listitem" class="collection-item-11 w-dyn-item">[\s\S]{0,400}?<a href="([^"]*)"[^>]*><div class="portfolio-company-name">([^<]*)<\/div>/g;
const HEADING = /<h2 class="heading portfolio">([^<]*)<\/h2>/g;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&amp;/g, '&')
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
	const html = await resp.text();

	const headings = [...html.matchAll(HEADING)].map((m) => ({ at: m.index, text: clean(m[1]) }));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const m of html.matchAll(ITEM)) {
		const name = clean(m[2]);
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({
			name,
			category: headings.filter((h) => h.at < m.index).pop()?.text ?? '',
			url: m[1]
		});
	}

	if (companies.length === 0) {
		throw new Error('shrug: no companies on the portfolio page');
	}

	return companies;
}
