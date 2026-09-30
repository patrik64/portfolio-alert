import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.blingcap.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js, the portfolio page served whole: a company is a card linking
// its site — its logo, its name, a line about it and, on the ones that have
// gone, a line in small capitals saying how: a listing ("Public: PLTR") or
// a sale ("Acquired by Coursera", or only "Acquired"). the search box above
// the wall runs in the browser. the fund files nothing else.

const CARD = /<a\b[^>]*\bhref="([^"]*)"[^>]*\bclass="group bg-white[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
const NAME = /<h3\b[^>]*>([\s\S]*?)<\/h3>/;
const NOTE = /<p\b[^>]*\bclass="text-xs[^"]*"[^>]*>([\s\S]*?)<\/p>/;
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

// "Public: PLTR" -> "IPO (PLTR)"; a sale is kept as written
function outcome(note: string): string {
	const listed = note.match(/^public\s*:\s*(\S+)$/i);
	if (listed) return `IPO (${listed[1]})`;
	return note;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, href, body] of html.matchAll(CARD)) {
		const name = clean(body.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const note = outcome(tag(body.match(NOTE)?.[1] ?? ''));
		const site = unescape(href).trim();
		companies.push({
			name,
			category: [note, note ? 'Exited' : ''].filter(Boolean).join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('bling: no companies on the portfolio page');
	}

	return companies;
}
