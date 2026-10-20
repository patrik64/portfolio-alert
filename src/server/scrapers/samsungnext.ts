import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.samsungnext.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the page's own collection list stops at webflow's hundred, and a
// script of the page's own puts a grid in its place, built from a file of
// all the companies on webflow's cdn, a name, a sector and a site each. the
// file's address is written into the script and changes with every upload,
// so it is read from the page; the page names two editions of the file, and
// the later wins there as here. a name's bracketed note is the company's
// former name, dropped as the page drops it. the catch-all "Others" sector
// is not kept as a tag.

const FILE = /https:\/\/cdn\.prod\.website-files\.com\/[a-f0-9]+\/[a-f0-9]+_pf-companies(?:-v(\d+))?\.json/g;
const NOTE = /\s*\([^)]*\)/g;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

interface Row {
	n?: unknown;
	s?: unknown;
	w?: unknown;
}

const clean = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await fetchText(PAGE_URL);
	const files = [...html.matchAll(FILE)].map(([url, edition]) => ({ url, edition: Number(edition ?? 1) }));
	if (files.length === 0) {
		throw new Error('samsungnext: no portfolio file named in the page — the markup moved');
	}
	const { url } = files.reduce((best, file) => (file.edition > best.edition ? file : best));
	const rows: unknown = JSON.parse((await fetchText(url)).replace(/^﻿/, ''));
	if (!Array.isArray(rows)) {
		throw new Error('samsungnext: the portfolio file is not a list');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const row of rows as Row[]) {
		const given = clean(row.n);
		const name = given.replace(NOTE, '').trim() || given;
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const sector = clean(row.s);
		const site = clean(row.w);
		companies.push({
			name,
			category: UNSAID.test(sector) ? '' : sector,
			url: /^https?:\/\//i.test(site) ? site : ''
		});
	}

	if (companies.length === 0) {
		throw new Error('samsungnext: no companies in the portfolio file');
	}

	return companies;
}
