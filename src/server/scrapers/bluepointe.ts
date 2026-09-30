import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.bluepointe.vc';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a vite app: the page is an empty shell that one script renders, and the
// portfolio travels inside that script as a list of objects — an id, the
// name, a line about the company, its site, the stage the fund came in at
// ("Seed", "Early Stage") and its standing, "Active" or "Exit". the
// script's name is hashed per build, so it is read off the shell each run.
// a company the fund is out of sometimes links the buyer's announcement
// rather than a site of its own, and that link is kept as given.

const SCRIPT = /<script\b[^>]*\bsrc="([^"]*\/assets\/index-[^"]+\.js)"/;
// {id:"akridata_early",name:"Akridata",description:"…",website:"…",logo:q.akridata,stage:"Early Stage",status:["Active"]}
// — the team's entries in the same script have names but no stage
const ENTRY = /\{id:"[^"]*",name:"(?:[^"\\]|\\.)*"[^{}]*?\bstage:"[^"]*"[^{}]*?\}/g;
const FIELD = (key: string) => new RegExp(`\\b${key}:"((?:[^"\\\\]|\\\\.)*)"`);
const STATUS = /\bstatus:\[([^\]]*)\]/;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

// a string as the bundle writes it, its escapes undone
const literal = (s: string) => unescape(s.replace(/\\(["'\\/])/g, '$1')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => literal(s).replace(/\s*,\s*/g, ' / ');

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const shell = await fetchText(PAGE_URL);
	const script = shell.match(SCRIPT)?.[1];
	if (!script) {
		throw new Error('bluepointe: the page names no script to read the portfolio from');
	}
	const bundle = await fetchText(new URL(unescape(script), BASE_URL).href);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [entry] of bundle.matchAll(ENTRY)) {
		const name = literal(entry.match(FIELD('name'))?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const site = literal(entry.match(FIELD('website'))?.[1] ?? '');
		const exited = /"exit(?:ed)?"/i.test(entry.match(STATUS)?.[1] ?? '');
		companies.push({
			name,
			category: [tag(entry.match(FIELD('stage'))?.[1] ?? ''), exited ? 'Exited' : ''].filter(Boolean).join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('bluepointe: no portfolio in the script');
	}

	return companies;
}
