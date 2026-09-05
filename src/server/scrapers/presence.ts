import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.presencecap.com/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a plain static page: the portfolio is a grid of logos further down it, each
// a link to the company with the logo as a background image. the fund puts the
// company's name in an alt attribute on the link — not where alt belongs, but
// it is the only place the name is written, so it is what the name is read
// from.
//
// the fund files its companies under nothing: no sectors, no exits section,
// nothing but the logo. a few links now point at an acquirer rather than the
// company — Uru at adobe.com, Blue Vision Labs at lyft.com — but the fund does
// not say so, and reading an exit into a link would be inventing what it has
// not published. so the category stays empty.

const COMPANY = /<a class="company-logo" href="([^"]*)"[^>]*alt="([^"]*)"/g;

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
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const m of html.matchAll(COMPANY)) {
		const name = clean(m[2]);
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({ name, category: '', url: clean(m[1]) });
	}

	if (companies.length === 0) {
		throw new Error('presence: no companies on the portfolio page');
	}

	return companies;
}
