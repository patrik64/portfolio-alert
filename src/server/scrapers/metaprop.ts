import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.metaprop.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a wall of logos with nothing written on it: no alt, no title, no name in any
// attribute, and the logo files are numbered rather than named. the only thing
// a tile carries is the link, so the address names the company, as for p1 and
// vu venture partners — which puts the compound ones back together as one
// word: Boweryvaluation, Switchautomation, Pinpointanalytics.
//
// the page holds two walls under two headings, and only the first is this
// fund's. the second is the founders' own proptech investments and opens on
// airbnb; taking the page at face value would credit this fund with it, the
// way node.vc's and morpheus's second lists would have. the headings are what
// tell them apart, since the theme gives both the same class.
//
// twenty-six of the fund's own hundred and twenty-three are marked as gone,
// and those are left out. for a company it still holds the fund links to the
// company; for one that has gone it links to wherever the company ended up,
// which is often the buyer — Betterview points at nearmap, Ravti at building
// engines, and others at moen, bp, zillow and wework as plainly. with no name
// anywhere on the page there is nothing to tell a company from the firm that
// bought it, and a portfolio listing BP would be worse than one that stops at
// what the fund still holds.

const SECTION = /<div class="founders-portfolio">([\s\S]*?)(?=<div class="founders-portfolio">|$)/g;
const TITLE = /class="main-title[^"]*">([\s\S]*?)<span/;
const BLOCK = /<div class="single-block([^"]*)">([\s\S]*?)(?=<div class="single-block|$)/g;
const SITE = /<a href="(https?:\/\/[^"]+)"[^>]*class="absolute-link"/;
// the wall that is not this fund's portfolio
const NOT_THE_FUND = /founder/i;
// the fund's own mark for a company it no longer holds
const GONE = /exited-logo/;
// what a company puts in front of its brand to get a free address
const DECORATION = /^(?:hello|hey|with|get|try|use|join|my|the)(?=[a-z]{3,})/;
// second levels that are not the brand — "spleet.africa" is Spleet
const GENERIC = new Set([
	'com', 'co', 'net', 'org', 'io', 'ai', 'app', 'vc', 'tech', 'us', 'me', 'is'
]);

const clean = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const titled = (s: string) =>
	s === s.toLowerCase() ? s.replace(/\b[a-z]/g, (c) => c.toUpperCase()) : s;

const fromHost = (url: string) => {
	try {
		const labels = new URL(url).hostname.replace(/^www\./, '').split('.');
		if (labels.length > 1) labels.pop();
		if (labels.length > 1 && GENERIC.has(labels[labels.length - 1])) labels.pop();
		return titled((labels[labels.length - 1] ?? '').replace(DECORATION, '').replace(/-+/g, ' '));
	} catch {
		return '';
	}
};

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, wall] of html.matchAll(SECTION)) {
		if (NOT_THE_FUND.test(clean(wall.match(TITLE)?.[1] ?? ''))) continue;

		for (const [, classes, block] of wall.matchAll(BLOCK)) {
			if (GONE.test(classes)) continue;

			const url = block.match(SITE)?.[1] ?? '';
			const name = fromHost(url);
			if (!name || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());

			companies.push({ name, category: '', url });
		}
	}

	if (companies.length === 0) {
		throw new Error('metaprop: no companies on the portfolio wall');
	}

	return companies;
}
