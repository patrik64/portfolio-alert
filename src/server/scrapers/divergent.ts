import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.divergenthq.com';
const PAGE_URL = `${BASE_URL}/#portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a next.js app that renders only in the browser: the page is an empty
// shell whose page script loads the site's one component from a further
// script, and the portfolio is written into that one as a list of objects
// — the name, a line about it, a system ("atoms", spelled out in a table
// beside it as Physical Systems), who it serves, where it is, its site and
// the fund. every script's name is hashed per build, so the page script and
// the webpack runtime are read off the shell each run, the component's
// script found through them. nothing marks an exit.

const SCRIPTS = /<script\b[^>]*\bsrc="(\/_next\/static\/chunks\/[^"]+\.js)"/g;
// the page script asks for the component's chunk by number
const LAZY_CHUNK = /\bn\.e\((\d+)\)/;
// the runtime names a chunk's file after its number
const CHUNK_FILE = /"static\/chunks\/"\+e\+"(\.[a-f0-9]+\.js)"/;
const COMPANIES = /companies:\[([\s\S]*?)\]\}/;
const FIELD = (key: string) => new RegExp(`\\b${key}:"((?:[^"\\\\]|\\\\.)*)"`);
const LIST = (key: string) => new RegExp(`\\b${key}:\\[([^\\]]*)\\]`);
const LABEL = /\b(\w+):\{label:"([^"]*)",subtitle:"([^"]*)"/g;
const STEALTH = /^stealth\b/i;

// the strings come as the script writes them, "Medell\xedn" for Medellín
const clean = (s: string) =>
	s
		.replace(/\\u([0-9a-f]{4})|\\x([0-9a-f]{2})/gi, (_, u, x) => String.fromCharCode(parseInt(u ?? x, 16)))
		.replace(/\\(["'\\])/g, '$1')
		.replace(/\s+/g, ' ')
		.trim();

// the category is comma-joined, so a place written "Idaho Falls, ID" would
// read as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const shell = await fetchText(`${BASE_URL}/`);
	const scripts = [...shell.matchAll(SCRIPTS)].map((m) => m[1]);
	const pageScript = scripts.find((s) => /\/app\/page-/.test(s));
	const runtime = scripts.find((s) => /\/webpack-/.test(s));
	if (!pageScript || !runtime) {
		throw new Error('divergent: the page names no scripts to read the portfolio from');
	}
	const [page, webpack] = await Promise.all([fetchText(BASE_URL + pageScript), fetchText(BASE_URL + runtime)]);
	const chunk = page.match(LAZY_CHUNK)?.[1];
	const suffix = webpack.match(CHUNK_FILE)?.[1];
	if (!chunk || !suffix) {
		throw new Error("divergent: the page script names no component to read the portfolio from");
	}
	const source = await fetchText(`${BASE_URL}/_next/static/chunks/${chunk}${suffix}`);

	// the systems and audiences, spelled out
	const labels = new Map([...source.matchAll(LABEL)].map(([, code, , subtitle]) => [code, clean(subtitle)]));
	const list = source.match(COMPANIES)?.[1] ?? '';

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const object of list.split(/\},\s*\{/)) {
		const name = clean(object.match(FIELD('name'))?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const codes = [...(object.match(LIST('category'))?.[1] ?? '').matchAll(/"([^"]*)"/g)].map((m) => m[1]);
		const audience = clean(object.match(FIELD('audience'))?.[1] ?? '');
		const fund = clean(object.match(FIELD('fund'))?.[1] ?? '');
		companies.push({
			name,
			category: [
				...codes.map((code) => tag(labels.get(code) ?? code)),
				tag(object.match(FIELD('location'))?.[1] ?? ''),
				// "both" audiences say nothing
				/^(industries|individuals)$/i.test(audience) ? audience[0].toUpperCase() + audience.slice(1) : '',
				fund ? `Fund ${fund}` : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: clean(object.match(FIELD('website'))?.[1] ?? '') || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('divergent: no companies in the component script');
	}

	return companies;
}
