import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.sogalventures.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// static webflow, one collection list and no pagination. each tile is a link
// to the company, with its logo and the founder's photograph behind it; the
// company's name is the alt text all three images share.
//
// the fund files nobody under a sector and marks no exits, so there is no
// category to record.

const ITEM = '<div role="listitem" class="collection-item w-dyn-item">';
const NAME = /<img[^>]*alt="([^"]*)"/;
const SITE = /href="(https?:\/\/[^"]*)"/;

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
		companies.push({ name, category: '', url: item.match(SITE)?.[1] ?? '' });
	}

	if (companies.length === 0) {
		throw new Error('sogal: no companies on the portfolio page');
	}

	return companies;
}
