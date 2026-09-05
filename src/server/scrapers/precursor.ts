import type { ScrapedCompany } from './types';

const BASE_URL = 'https://precursorvc.com';
const PAGE_URL = `${BASE_URL}/portfolio/`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// the site is a single-page app, so every route serves the same small shell
// and the portfolio is an array in the bundle it loads. the bundle's name
// carries a content hash and changes whenever the fund rebuilds the site, so
// it is read off the shell rather than written down here.
//
// the same bundle holds a second array of the fund's founders, whose entries
// also have a name and a sector but no address. requiring one keeps the
// founders out, and nothing is lost by it: they carry the company they founded
// rather than anything the portfolio list does not already say.
//
// two companies are filed under no sector and one, Clutch, is listed twice.

const BUNDLE = /<script[^>]*src="([^"]*\/assets\/index-[^"]*\.js)"/;
// an object naming a company, with whatever the fund recorded about it
const ENTRY = /\{name:"((?:[^"\\]|\\.)*)"([^{}]*websiteUrl:"[^"]*"[^{}]*)\}/g;
const FIELD = (key: string) => new RegExp(`\\b${key}:"((?:[^"\\\\]|\\\\.)*)"`);

const clean = (s: string) =>
	s
		.replace(/\\"/g, '"')
		.replace(/\\\\/g, '\\')
		.replace(/\s+/g, ' ')
		.trim();

// the category is comma-joined, so a sector the fund wrote with a comma in it
// would read as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const shell = await resp.text();

	const bundlePath = shell.match(BUNDLE)?.[1];
	if (!bundlePath) {
		throw new Error('precursor: the page loads no bundle to read the companies from');
	}
	const bundleUrl = new URL(bundlePath, BASE_URL).toString();

	const bundleResp = await fetch(bundleUrl, { headers: { 'User-Agent': UA } });
	if (!bundleResp.ok) {
		throw new Error(`Failed to fetch ${bundleUrl}: ${bundleResp.status}`);
	}
	const bundle = await bundleResp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const m of bundle.matchAll(ENTRY)) {
		const rest = m[2];
		const url = clean(rest.match(FIELD('websiteUrl'))?.[1] ?? '');
		if (!url) continue;

		const name = clean(m[1]);
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({ name, category: tag(rest.match(FIELD('sector'))?.[1] ?? ''), url });
	}

	if (companies.length === 0) {
		throw new Error('precursor: no companies in the site bundle');
	}

	return companies;
}
