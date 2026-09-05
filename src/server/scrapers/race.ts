import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://race.capital/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// the fund's site is a single-page app, so every route serves the same five
// kilobyte shell and the portfolio lives in the bundle it loads. the companies
// are an array in there, each with a name, a sector, a line about it and its
// address; the fund keeps it by hand.
//
// the bundle also holds a shorter list for the logo strip on the front page,
// which carries names but no addresses and no sectors. those are the same
// companies written shorter — "Opaque" for Opaque Systems — so only the
// objects with an address are read, and nothing is lost by it.
//
// four names carry "(Acq by X)". that is how the investment ended rather than
// what the company is called, so it moves to the category.

const BUNDLE = /<script[^>]*src="(https:\/\/cdn\.magicpatterns\.com\/[^"]+\.js)"/;
// an object naming a company, with whatever the fund recorded about it
const ENTRY = /\{name:"((?:[^"\\]|\\.)*)",logo:"[^"]*"([^{}]*)\}/g;
const FIELD = (key: string) => new RegExp(`\\b${key}:"((?:[^"\\\\]|\\\\.)*)"`);
const ACQUIRED = /\s*\(\s*acq(?:uired)?\.?\s+by ([^)]+)\)\s*$/i;

const clean = (s: string) =>
	s
		.replace(/\\"/g, '"')
		.replace(/\\\\/g, '\\')
		.replace(/\s+/g, ' ')
		.trim();

// the category is comma-joined, so a sector the fund wrote as "Devtools,
// Productivity & Open-source" would read as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const shell = await resp.text();

	const bundleUrl = shell.match(BUNDLE)?.[1];
	if (!bundleUrl) {
		throw new Error('race: the page loads no bundle to read the companies from');
	}

	const bundleResp = await fetch(bundleUrl, { headers: { 'User-Agent': UA } });
	if (!bundleResp.ok) {
		throw new Error(`Failed to fetch ${bundleUrl}: ${bundleResp.status}`);
	}
	const bundle = await bundleResp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const m of bundle.matchAll(ENTRY)) {
		const rest = m[2];
		const url = clean(rest.match(FIELD('website'))?.[1] ?? '');
		if (!url) continue;

		const listed = clean(m[1]);
		const acquirer = listed.match(ACQUIRED)?.[1];
		const name = clean(listed.replace(ACQUIRED, ''));
		if (!name || seen.has(name)) continue;
		seen.add(name);

		companies.push({
			name,
			category: [
				tag(rest.match(FIELD('category'))?.[1] ?? ''),
				acquirer ? `Acquired by ${clean(acquirer)}` : ''
			]
				.filter(Boolean)
				.join(', '),
			url
		});
	}

	if (companies.length === 0) {
		throw new Error('race: no companies in the site bundle');
	}

	return companies;
}
