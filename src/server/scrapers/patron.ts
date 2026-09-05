import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://patron.fund/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js over sanity. the rows on the page carry a name, a year and an
// industry, but the link to the company is in a panel that only exists once
// the row is opened — so the page is read as react's own payload instead,
// where the whole collection is written out, panels and all.
//
// the payload arrives as a run of javascript string literals that have to be
// unescaped and joined before the json inside them can be read.
//
// five companies have no site of their own on file, only an X or youtube
// account. an account is not the company's address, so those are left without
// one rather than pointed at a profile.

const CHUNK = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
const COMPANIES = '"companies":';
// the link the fund files as the company's own
const WEBSITE = /^website$/i;

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so an industry written with a comma in it
// would read as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// json.parse wants a whole document, so the array has to be measured out of
// the payload first — counting brackets, but only those outside a string
const jsonAt = (payload: string, from: number): string => {
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let i = from; i < payload.length; i++) {
		const c = payload[i];
		if (escaped) escaped = false;
		else if (c === '\\') escaped = true;
		else if (c === '"') inString = !inString;
		else if (!inString) {
			if (c === '[' || c === '{') depth++;
			else if (c === ']' || c === '}') {
				depth--;
				if (depth === 0) return payload.slice(from, i + 1);
			}
		}
	}
	return '';
};

interface Company {
	title?: string;
	industry?: { title?: string };
	companyLinks?: { label?: string; url?: string }[];
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const payload = [...html.matchAll(CHUNK)].map((m) => JSON.parse(m[1]) as string).join('');
	const at = payload.indexOf(COMPANIES);
	if (at < 0) {
		throw new Error('patron: the page carries no portfolio collection');
	}

	const listed = jsonAt(payload, at + COMPANIES.length);
	let rows: Company[];
	try {
		rows = JSON.parse(listed) as Company[];
	} catch {
		throw new Error('patron: the portfolio collection could not be read');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const row of rows) {
		const name = clean(row.title ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const site = row.companyLinks?.find((link) => WEBSITE.test(link.label ?? ''))?.url;
		companies.push({
			name,
			category: tag(row.industry?.title ?? ''),
			url: clean(site ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('patron: no companies in the portfolio collection');
	}

	return companies;
}
