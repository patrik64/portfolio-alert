import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.unshackledvc.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// the served page is an empty vite shell; the portfolio is an array written
// into the javascript bundle, whose filename is hashed per deploy and so is
// read from the shell each run.
//
// a name sometimes carries a note in brackets — a ticker, an acquirer, or a
// former name. the note leaves the name and becomes a tag only where it says
// the company has left the portfolio; "(formerly On Deck)" says no such thing.

const BUNDLE = /<script[^>]*type="module"[^>]*src="([^"]+\.js)"/;
// the array the portfolio page filters; each entry names a company, links it
// and files it under one category
const ARRAY = /\bwx=\[/;

// slice out the array starting at `from`, tracking strings so brackets inside
// a description can't end it early
function sliceArray(js: string, from: number): string {
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let i = from; i < js.length; i++) {
		const ch = js[i];
		if (inString) {
			if (escaped) escaped = false;
			else if (ch === '\\') escaped = true;
			else if (ch === '"') inString = false;
		} else if (ch === '"') inString = true;
		else if (ch === '[') depth++;
		else if (ch === ']' && --depth === 0) return js.slice(from, i + 1);
	}
	throw new Error('unshackled: the portfolio array never closes');
}

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const shell = await fetchText(PAGE_URL);
	const bundlePath = shell.match(BUNDLE)?.[1];
	if (!bundlePath) {
		throw new Error('unshackled: no module bundle in the page shell');
	}
	const js = await fetchText(new URL(bundlePath, PAGE_URL).href);

	const at = js.match(ARRAY);
	if (at?.index === undefined) {
		throw new Error('unshackled: no portfolio array in the bundle');
	}
	const array = sliceArray(js, at.index + at[0].length - 1);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	// the fields are written in no fixed order, so each is read on its own
	for (const [, entry] of array.matchAll(/\{(name:"[\s\S]*?)\}(?=,\{|\]$)/g)) {
		const raw = entry.match(/name:"((?:[^"\\]|\\.)*)"/)?.[1] ?? '';
		const name = raw.replace(/\s*\([^)]*\)\s*$/, '').trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);

		const note = raw.slice(name.length);
		const tags = [entry.match(/category:"([^"]*)"/)?.[1]?.trim() ?? ''];
		if (/acquired\s+by/i.test(note)) tags.push('Acquired');
		else if (/\b(nyse|nasdaq|ipo)\b/i.test(note)) tags.push('Exited');

		companies.push({
			name,
			category: tags.filter(Boolean).join(', '),
			url: entry.match(/url:"(https?:\/\/[^"]*)"/)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('unshackled: no companies in the portfolio array');
	}

	return companies;
}
