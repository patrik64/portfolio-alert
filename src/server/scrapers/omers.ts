import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.omersventures.com/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js over contentful. the companies are drawn by a client component, so
// the served markup holds the filters and the footer and not one name — but
// next ships the data the component will draw beside it, as the react payload
// it pushes into the page a chunk at a time. the chunks are json strings, and
// a company straddles two of them as often as not, so they are unescaped and
// joined back into the one payload before anything is read out of it.
//
// what the fund files a company under is what the page lets a reader filter
// on: the theme it invests under and whether the company is current or former.
// where the company is is in the payload too, and is kept — it is the one
// thing the fund says about a company that the filters do not.
//
// the whole portfolio is in the payload; there is no more to ask for. one
// company has no exited flag at all rather than a false one, which reads the
// same way: not an exit until the fund says so.

// next pushes its payload as javascript string literals
const CHUNK = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
// a company as contentful hands it over
const ENTRY = /\{"id":"[^"]*","contentType":"portfolio"/g;

interface Entry {
	title?: string;
	industry?: string;
	region?: string;
	websiteUrl?: string;
	exited?: boolean;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a theme written with a comma in it would
// read as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// an object is cut out by counting braces, so that a brace inside a name or a
// url cannot end it early
const objectAt = (source: string, from: number) => {
	let depth = 0;
	let inString = false;
	for (let at = from; at < source.length; at++) {
		const char = source[at];
		if (inString) {
			if (char === '\\') at++;
			else if (char === '"') inString = false;
			continue;
		}
		if (char === '"') inString = true;
		else if (char === '{') depth++;
		else if (char === '}' && --depth === 0) return source.slice(from, at + 1);
	}
	return '';
};

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	let payload = '';
	for (const [, literal] of html.matchAll(CHUNK)) {
		try {
			payload += JSON.parse(literal) as string;
		} catch {
			// a chunk that will not unescape is one the page cannot draw either
		}
	}
	if (!payload) {
		throw new Error('omers: the page no longer ships the portfolio beside it');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const match of payload.matchAll(ENTRY)) {
		const literal = objectAt(payload, match.index);
		if (!literal) continue;

		let entry: Entry;
		try {
			entry = JSON.parse(literal) as Entry;
		} catch {
			continue;
		}

		const name = clean(entry.title ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({
			name,
			category: [tag(entry.industry ?? ''), tag(entry.region ?? ''), entry.exited ? 'Exited' : '']
				.filter(Boolean)
				.join(', '),
			url: clean(entry.websiteUrl ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('omers: no companies in the portfolio');
	}

	return companies;
}
