import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.storyventures.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// static webflow, the whole table in the html. each row names the company,
// links to it, describes it, and files it under up to three of the fund's
// three themes — machine intelligence, data processing, sensory systems.
//
// webflow leaves the unused category slots in place as empty divs, so only the
// ones with text count. the fund marks no exits.

const ITEM = '<div role="listitem" class="portfolio_table-item w-dyn-item">';
// the fund's own spelling of the class
const NAME = /<div class="hightlights_title">([^<]*)<\/div>/;
const SITE = /<a href="(https?:\/\/[^"]*)"[^>]*class="portolio_logo-link/;
const CATEGORY = /fs-cmsfilter-field="category" class="category-id">([^<]*)<\/div>/g;

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

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const name = clean(item.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({
			name,
			category: [...new Set([...item.matchAll(CATEGORY)].map((m) => clean(m[1])))]
				.filter(Boolean)
				.join(', '),
			url: item.match(SITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('story: no companies on the portfolio page');
	}

	return companies;
}
