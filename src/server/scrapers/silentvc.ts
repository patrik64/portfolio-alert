import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://silentvc.com/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a carrd one-pager. the portfolio is two galleries of logos — the fund's own
// companies, and the founder's earlier cheques under "Select Prior
// Investments" — and both are read, because both are companies the fund backs
// or has backed.
//
// each logo links to the company and carries its name twice, in the image's
// title and in an alt of the form "Aeon Industrial - Silent Ventures". the
// title is the cleaner of the two.
//
// the page files nobody under a sector and marks no exits.

const ITEM = /<a href="(https?:\/\/[^"]+)"[^>]*class="thumbnail[^"]*"[\s\S]{0,900}?title="([^"]*)"/g;

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
	for (const m of html.matchAll(ITEM)) {
		const name = clean(m[2]);
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({ name, category: '', url: m[1] });
	}

	if (companies.length === 0) {
		throw new Error('silentvc: no companies on the portfolio page');
	}

	return companies;
}
