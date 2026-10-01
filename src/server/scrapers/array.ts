import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.array.vc';
const PAGE_URL = `${BASE_URL}/`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js: the home page's "Relevant Portfolio" is a table its script
// fills from two lists compiled into it, the "Active Investments", each
// with its name, a line about it, its category, its stage and its site,
// and the "Exits", each with the buyer, the year and a link, the buyer's
// site. the category and stage are kept as tags, and an exit as the sale
// ("Acquired by Klaviyo"), without the year, or "Secondary sale" as
// written. the scripts' names are hashed per build, so the page is read
// for them each run, the page's own script first, until the lists are
// found.

const CHUNK = /<script\b[^>]*\bsrc="(\/_next\/static\/chunks\/[^"]+)"/g;
// an entry of either list, its fields all strings
const ENTRY = /\{name:"(?:[^"\\]|\\.)*"(?:,\w+:"(?:[^"\\]|\\.)*")*\}/g;
const FIELD = /(\w+):"((?:[^"\\]|\\.)*)"/g;
const STEALTH = /^stealth\b/i;

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/\s*,\s*/g, ' / ');

// a javascript string's contents, its escapes undone where json reads them
const unquote = (s: string) => {
	try {
		return JSON.parse(`"${s}"`) as string;
	} catch {
		return s;
	}
};

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

// the entries of both lists, each as its fields, or none when the script
// carries neither
function entriesIn(script: string): Map<string, string>[] {
	return [...script.matchAll(ENTRY)]
		.map(([entry]) => new Map([...entry.matchAll(FIELD)].map(([, key, value]) => [key, unquote(value)])))
		.filter((fields) => fields.has('website') && (fields.has('stage') || fields.has('acquiringCompany')));
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const shell = await fetchText(PAGE_URL);
	const chunks = [...new Set([...shell.matchAll(CHUNK)].map(([, src]) => src.replace(/&amp;/g, '&')))].sort(
		(a, b) => Number(!/\/app\/page-/.test(a)) - Number(!/\/app\/page-/.test(b))
	);
	let entries: Map<string, string>[] = [];
	for (const chunk of chunks) {
		entries = entriesIn(await fetchText(`${BASE_URL}${chunk}`));
		if (entries.length > 0) break;
	}
	if (entries.length === 0) {
		throw new Error('array: no script on the page carries the portfolio');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const fields of entries) {
		const name = (fields.get('name') ?? '').replace(/\s+/g, ' ').trim();
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const buyer = tag(fields.get('acquiringCompany') ?? '');
		const went = !fields.has('acquiringCompany') ? '' : /^secondary\b/i.test(buyer) ? buyer : `Acquired by ${buyer}`;
		const site = (fields.get('website') ?? '').trim();
		companies.push({
			name,
			category: [tag(fields.get('category') ?? ''), tag(fields.get('stage') ?? ''), went, went ? 'Exited' : '']
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	return companies;
}
