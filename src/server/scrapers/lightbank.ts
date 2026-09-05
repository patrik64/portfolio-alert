import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.lightbank.com/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace, and the plainest portfolio of them all: the companies are a
// wall of bare names, one centered paragraph each, with no links, no sectors
// and no locations anywhere on the page. the same paragraph style also
// carries the page's one question to the reader ("Interested in working with
// us...?"), which is told apart by being a question; the "View open roles"
// line under it holds a link, which the name pattern already refuses.

const NAME = /<p style="text-align:center;white-space:pre-wrap;" class="">([^<]+)<\/p>/g;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

// a trademark sign is branding rather than the name
const clean = (s: string) => unescape(s).replace(/[®™]/g, '').replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const m of html.matchAll(NAME)) {
		const name = clean(m[1]);
		if (!name || name.endsWith('?') || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: '', url: '' });
	}

	if (companies.length === 0) {
		throw new Error('lightbank: no companies on the page');
	}

	return companies;
}
