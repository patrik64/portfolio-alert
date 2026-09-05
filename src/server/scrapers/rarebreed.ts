import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.rarebreed.vc/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// static webflow, and the portfolio is one rich-text block: a heading per
// company, each linking to it. no sectors, no exits, no logos — the fund
// publishes the name and the address and nothing else.
//
// three companies are written as links to "#", so they keep no address.

const LIST = /class="portfolio-list w-richtext">([\s\S]*?)<\/div>/;
const ITEM = /<h2>[^<]*<a href="([^"]*)"[^>]*>([^<]*)<\/a><\/h2>/g;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		// the fund's editor left a zero-width joiner in front of half the names
		.replace(/[​-‍﻿]/g, '')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = (await resp.text()).replace(/\s+/g, ' ');

	const list = html.match(LIST)?.[1];
	if (!list) {
		throw new Error('rarebreed: no portfolio list on the companies page');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const m of list.matchAll(ITEM)) {
		const name = clean(m[2]);
		if (!name || seen.has(name)) continue;
		seen.add(name);
		const site = clean(m[1]);
		companies.push({ name, category: '', url: site.startsWith('http') ? site : '' });
	}

	if (companies.length === 0) {
		throw new Error('rarebreed: no companies on the companies page');
	}

	return companies;
}
