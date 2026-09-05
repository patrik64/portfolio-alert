import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.ribbitcap.com/rebels';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js, and the fund calls its portfolio the rebels. the list is server
// rendered as two columns: the company, and the founders the fund backed,
// given as first names and an initial.
//
// nothing else is published. the page carries no external links at all, so no
// addresses, and no sectors or exits. founders are people rather than a
// category, so the name is all there is to record.

const ITEM =
	/data-type="scrollable-list-item"[^>]*>\s*<span[^>]*><span class="truncate">([^<]*)<\/span><\/span>/g;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
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
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const m of html.matchAll(ITEM)) {
		const name = clean(m[1]);
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({ name, category: '', url: '' });
	}

	if (companies.length === 0) {
		throw new Error('ribbit: no companies on the portfolio page');
	}

	return companies;
}
