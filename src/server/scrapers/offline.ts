import type { ScrapedCompany } from './types';

const BASE_URL = 'https://offline.vc';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a react app with nothing behind it: the page is a shell, and the fund keeps
// its portfolio in the bundle it ships rather than in a cms it asks for. so
// the bundle is read.
//
// which bundle is not written down here — the file is named after its own
// contents and is renamed by every build — so the page is asked which one it
// is loading, the way it tells a browser.
//
// the portfolio is a minified array, not json: its keys are bare and its
// booleans are !0 and !1. so a company is found by its shape rather than by
// the name the minifier gave the array, which changes as freely as the
// filename: an object that opens on an id and a name and carries a sector is a
// company, and nothing else in the bundle is.
//
// the fund files a company under one sector and nothing else — it records no
// stage, no place and no exit, and marks 21 of the 131 as featured, which is
// what the fund is pointing at rather than anything about the company, so that
// is left out. two companies have no address written down and keep none.

const BUNDLE = /<script[^>]*\bsrc="(\/assets\/index-[^"]+\.js)"/;
const ENTRY = /\{id:"[^"]*",name:"/g;
const FIELD = (key: string) => new RegExp(`\\b${key}:"((?:[^"\\\\]|\\\\.)*)"`);
// a company is an entry the fund files under a sector
const SECTOR = /\bsector:"/;

// the values are javascript strings rather than json ones
const unescape = (s: string) =>
	s.replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
		.replace(/\\(.)/g, (_, char) => (char === 'n' ? ' ' : char === 't' ? ' ' : char));

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a sector written with a comma in it would
// read as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const field = (entry: string, key: string) => clean(entry.match(FIELD(key))?.[1] ?? '');

// an entry is cut out by counting braces, so that a brace inside a write-up
// cannot end it early
const entryAt = (source: string, from: number) => {
	let depth = 0;
	let quote = '';
	for (let at = from; at < source.length; at++) {
		const char = source[at];
		if (quote) {
			if (char === '\\') at++;
			else if (char === quote) quote = '';
			continue;
		}
		if (char === '"' || char === "'" || char === '`') quote = char;
		else if (char === '{') depth++;
		else if (char === '}' && --depth === 0) return source.slice(from, at + 1);
	}
	return '';
};

export async function scrape(): Promise<ScrapedCompany[]> {
	const page = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!page.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${page.status}`);
	}

	const path = (await page.text()).match(BUNDLE)?.[1];
	if (!path) {
		throw new Error('offline: the page no longer says which bundle it is loading');
	}

	const resp = await fetch(`${BASE_URL}${path}`, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${BASE_URL}${path}: ${resp.status}`);
	}
	const bundle = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const match of bundle.matchAll(ENTRY)) {
		const entry = entryAt(bundle, match.index);
		if (!entry || !SECTOR.test(entry)) continue;

		const name = field(entry, 'name');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({
			name,
			category: tag(field(entry, 'sector')),
			url: field(entry, 'website')
		});
	}

	if (companies.length === 0) {
		throw new Error('offline: no companies in the bundle');
	}

	return companies;
}
