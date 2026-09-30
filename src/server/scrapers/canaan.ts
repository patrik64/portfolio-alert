import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.canaan.com';
const PAGE_URL = `${BASE_URL}/companies`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// rails: the companies page holds every company the firm has backed, as a
// wall of logos with the names under them — the current ones, and, hidden
// until "View" is switched, the previous ones, which are its exits; a few
// say how they went ("Acquired by Cato Networks", "NASDAQ (ASTR)"). each
// opens the company's page on the firm's site, where its site is, so the
// companies link there, as the wall would take a page apiece to follow.
// the firm's own israeli arm is on the wall too and is left out.

const ITEM = /<a\b[^>]*\bclass="list-item company-status--(\w+)"[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
const NAME = /<p\b[^>]*>([\s\S]*?)<\/p>/;
const NOTE = /<\/p>\s*<div\b[^>]*>([\s\S]*?)<\/div>/;
const FIRM = /^canaan\b/i;
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

// "NYSE (AEVA)" -> "IPO (NYSE: AEVA)"; an acquisition is kept as written
function outcome(note: string): string {
	const listed = note.match(/^(nyse|nasdaq|lse|tsx)\s*\(([^)]+)\)$/i);
	return listed ? `IPO (${listed[1].toUpperCase()}: ${listed[2]})` : note;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, status, href, body] of html.matchAll(ITEM)) {
		const name = clean(body.match(NAME)?.[1] ?? '');
		if (!name || FIRM.test(name) || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const previous = status.toLowerCase() === 'previous';
		const note = outcome(tag(body.match(NOTE)?.[1] ?? ''));
		const page = unescape(href).trim();
		companies.push({
			name,
			category: [note, previous ? 'Exited' : ''].filter(Boolean).join(', '),
			url: page.startsWith('/') ? `${BASE_URL}${page}` : /^https?:\/\//i.test(page) ? page : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('canaan: no companies on the companies page');
	}

	return companies;
}
