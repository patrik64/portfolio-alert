import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.borderlesscapital.io/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// framer: the portfolio page is a table served whole, a row a company — its
// name as the fund types it, legal form and all ("Artory Inc", "TYKHE
// CAPITAL GROUP LIMITED"), its sector ("DePin", "Stablecoins"), a note on
// how the fund stands with it, empty but for a few ("Acquired by Cisco",
// "Partially Exited"), and a "Website" link. the page carries the table
// twice, once a breakpoint, so the second copy of a company is passed over.
// a partial exit leaves the fund in, so only a sale is an exit.

const ROW = /(?=<div\b[^>]*\bdata-framer-name="Title")/;
const TEXT = /<p\b[^>]*>([\s\S]*?)<\/p>/;
const FUND = /<div\b[^>]*\bdata-framer-name="Fund"[^>]*>\s*<p\b[^>]*>([\s\S]*?)<\/p>/g;
const SITE = /<a\b[^>]*\bhref="([^"]*)"[^>]*>\s*Website/;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	// a row's fields are the first of each kind after its title, so the last
	// row running on to the end of the page reads no worse than the others
	for (const row of html.split(ROW).slice(1)) {
		const name = clean(row.match(TEXT)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const [sector = '', note = ''] = [...row.matchAll(FUND)].map(([, text]) => tag(text));
		// a few addresses are typed with a space in them
		const site = unescape(row.match(SITE)?.[1] ?? '').replace(/\s+/g, '');
		companies.push({
			name,
			category: [sector, note, /^acquired\b/i.test(note) ? 'Exited' : ''].filter(Boolean).join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('borderless: no companies on the portfolio page');
	}

	return companies;
}
