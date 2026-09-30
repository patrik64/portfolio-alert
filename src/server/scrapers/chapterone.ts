import type { ScrapedCompany } from './types';

const BASE_URL = 'https://chapterone.com';
const PAGE_URL = `${BASE_URL}/investments`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a single-page app: the investments page is drawn in the browser from a
// list written into the site's script — each investment a record of its
// name, its category ("Crypto", "AI/ML"), its site and a line about it.
// the script's address changes with every build and is read from the page.
// a name is the company's registered one as often as not ("Mercury
// Technologies, Inc.", "MDK (Cumulo Global Inc.)", "Quo (fka OpenPhone)");
// the legal form and a note in brackets are not part of it. nothing marks
// an exit.

const SCRIPT = /<script\b[^>]*\bsrc="(\/assets\/index-[^"]+\.js)"/;
// a record of the list: {n:"Supabase",c:"Dev Tools",u:"https://supabase.com",...}
const RECORD = /\{n:"((?:[^"\\]|\\.)*)"((?:,[\w$]+:(?:"(?:[^"\\]|\\.)*"|[\w$.]+))*)\}/g;
const FIELD = /,([\w$]+):"((?:[^"\\]|\\.)*)"/g;
const NOTE = /\s*\([^()]*\)\s*$/;
const FORM = /[\s,]+(?:inc\.?|llc|ltd\.?|limited|corp\.?|ag|gmbh)$/i;
// names whose legal form is how the company is known
const KEEP = new Set(['math inc.']);
const STEALTH = /^stealth\b/i;

const text = (s: string) =>
	s
		.replace(/\\"/g, '"')
		.replace(/\\u([0-9a-f]{4})/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
		.replace(/\s+/g, ' ')
		.trim();

// "Mercury Technologies, Inc." -> "Mercury Technologies", "Quo (fka OpenPhone)" -> "Quo"
function nameOf(written: string): string {
	if (KEEP.has(written.toLowerCase())) return written;
	let name = written;
	for (let before = ''; before !== name; ) {
		before = name;
		name = name.replace(NOTE, '').replace(FORM, '').trim();
	}
	return name || written;
}

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const script = (await fetchText(PAGE_URL)).match(SCRIPT)?.[1];
	if (!script) {
		throw new Error('chapterone: the investments page loads no script');
	}
	const code = await fetchText(`${BASE_URL}${script}`);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, written, rest] of code.matchAll(RECORD)) {
		const fields = new Map([...rest.matchAll(FIELD)].map(([, key, value]) => [key, text(value)]));
		// the list's records are the ones carrying a line about the company
		if (!fields.has('d')) continue;
		const name = nameOf(text(written));
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const site = fields.get('u') ?? '';
		companies.push({
			name,
			category: (fields.get('c') ?? '').replace(/\s*,\s*/g, ' / '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error("chapterone: no investments in the site's script");
	}

	return companies;
}
