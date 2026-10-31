import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.helicaseventure.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wix, the portfolio written into the page: a box per company that turns over
// on hover, holding its name, a line about it and, for one the fund is out of,
// how it went ("Acquired by Abbvie", "NASDAQ: ABSI"), over a button to its
// site. a banner across the logo says "ACQUIRED" or "IPO" on most of those, and
// on a few is all that says so. nothing else is said of a company: the sectors
// are a page of their own, and the footnote about investments made before the
// fund's spinout is marked on no card.
//
// the stealth company is left out. TOT Biopharm's and Medeon's buttons still
// carry the address of the card they were copied from, Absci's, so an address
// an earlier card has used says nothing of this company and is dropped.

const CARD = 'aria-label="content changes on hover"';
const LINE = /<(p|h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/g;
const SITE = /href="(https?:\/\/[^"]+)"[^>]*aria-label="Website"/;
// how it went stands on a line of its own or closes the line about the company
const NOTE = /(?:^|\. )([Aa]cquired by\b.+|[A-Z]+: ?[A-Z0-9.]+)$/;
const BANNERS: Record<string, string> = { acquired: 'Acquired', ipo: 'IPO' };
const STEALTH = /\bstealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) =>
	unescape(s.replace(/<[^>]*>/g, ' '))
		// wix pads its empty text elements with zero-width spaces
		.replace(/[​-‍﻿]/g, '')
		.replace(/\s+/g, ' ')
		.trim();

// the category is comma-joined, so a note holding a comma would read as two
const tag = (s: string) => s.replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	const addresses = new Set<string>();
	for (const card of html.split(CARD).slice(1)) {
		const lines = [...card.matchAll(LINE)].map(([, , line]) => clean(line)).filter(Boolean);
		const banner = lines.map((line) => BANNERS[line.toLowerCase()]).find(Boolean);
		const [name = '', ...rest] = lines.filter((line) => !BANNERS[line.toLowerCase()]);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const how = rest.map((line) => line.match(NOTE)?.[1]).find(Boolean) ?? banner;
		const site = card.match(SITE)?.[1] ?? '';
		companies.push({
			name,
			category: how ? `${tag(how)}, Exited` : '',
			url: addresses.has(site) ? '' : site
		});
		addresses.add(site);
	}

	if (companies.length === 0) {
		throw new Error('helicase: no companies on the portfolio page');
	}

	return companies;
}
