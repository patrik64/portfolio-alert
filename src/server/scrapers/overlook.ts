import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.overlook.vc/portfolio';
const BASE_URL = 'https://www.overlook.vc';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a vite app: the page is an empty root and one bundle, and the portfolio is
// written into the bundle as an array. so the shell is read for the bundle's
// name and the array is taken out of the javascript.
//
// three lists in there look alike and only one is the portfolio. the fund also
// publishes its co-investors, and a "Select Previous Investments" section it
// introduces as a track record built over decades — the page says under its
// own heading that some investments are prior to Overlook, and those twenty
// are the ones it means. Next Insurance and Babylon Health belong to the
// partners' earlier firms rather than to this fund, so they are left out.
//
// what separates the portfolio is that its entries carry a logo the fund
// serves from /portfolio/. the co-investors' come from /coinvestors/, and the
// previous investments have none.
//
// the four stealth cards have no name — the fund prints Undisclosed — so there
// is nothing to file them under and they are left out too.
//
// the fund files a company under one of two slugs, and the filter strip above
// the grid is where those slugs are spelled out, so the strip is read rather
// than the labels being written in here. the year is when the fund invested
// rather than anything about the company, so it is left out.

const BUNDLE = /<script[^>]*src="([^"]*\/assets\/index-[^"]*\.js)"/;
// an entry in the portfolio array: a name, and a logo the fund serves itself
const ENTRY = /\{name:"((?:[^"\\]|\\.)*)"([^{}]*logo:"\/portfolio\/[^"]*"[^{}]*)\}/g;
// the filter strip, where each slug is given the words the fund shows for it
const FILTER = /\{label:"((?:[^"\\]|\\.)*)",value:"([a-z-]+)"\}/g;
// the strip's first button, which stands for no filter at all
const EVERY = /^all$/i;

const unescape = (s: string) =>
	s
		.replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
		.replace(/\\x([0-9a-fA-F]{2})/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
		.replace(/\\n/g, ' ')
		.replace(/\\(.)/g, '$1');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a tag written with a comma in it would read
// as two rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const field = (body: string, name: string) =>
	clean(body.match(new RegExp(`${name}:"((?:[^"\\\\]|\\\\.)*)"`))?.[1] ?? '');

export async function scrape(): Promise<ScrapedCompany[]> {
	const shell = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!shell.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${shell.status}`);
	}
	const src = (await shell.text()).match(BUNDLE)?.[1];
	if (!src) {
		throw new Error('overlook: the page no longer names a bundle to read the portfolio from');
	}

	const bundleUrl = new URL(src, BASE_URL).toString();
	const resp = await fetch(bundleUrl, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${bundleUrl}: ${resp.status}`);
	}
	const bundle = await resp.text();

	const named = new Map<string, string>();
	for (const [, label, slug] of bundle.matchAll(FILTER)) {
		if (!EVERY.test(slug)) named.set(slug, clean(label));
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, written, body] of bundle.matchAll(ENTRY)) {
		const name = clean(written);
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const slug = field(body, 'category');
		companies.push({
			name,
			category: [tag(named.get(slug) ?? slug), tag(field(body, 'stage')), tag(field(body, 'location'))]
				.filter(Boolean)
				.join(', '),
			url: field(body, 'url')
		});
	}

	if (companies.length === 0) {
		throw new Error('overlook: no companies in the portfolio');
	}

	return companies;
}
