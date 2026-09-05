import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.shine.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js app router, so the page's data arrives as a react flight stream
// split across a dozen self.__next_f.push calls. stitched back together it
// holds an "investments" array straight out of the fund's sanity dataset:
// name, address, the buckets it is filed under, and a status that is either
// nothing or "Exited".

const PUSH = /self\.__next_f\.push\(\[1,(".*?")\]\)<\/script>/gs;
const KEY = '"investments":';

interface Investment {
	name?: string;
	url?: string;
	buckets?: string[] | null;
	status?: { name?: string } | null;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the array runs to its matching bracket; the stream around it is not json
function investmentsIn(payload: string): Investment[] {
	const at = payload.indexOf(KEY);
	if (at < 0) return [];
	const start = at + KEY.length;
	let depth = 0;
	for (let i = start; i < payload.length; i++) {
		if (payload[i] === '[') depth++;
		else if (payload[i] === ']') {
			depth--;
			if (depth === 0) {
				try {
					return JSON.parse(payload.slice(start, i + 1));
				} catch {
					return [];
				}
			}
		}
	}
	return [];
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	let payload = '';
	for (const m of html.matchAll(PUSH)) {
		try {
			payload += JSON.parse(m[1]);
		} catch {
			// a chunk that will not parse carries no companies
		}
	}

	const rows = investmentsIn(payload);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const row of rows) {
		const name = clean(row.name ?? '');
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({
			name,
			category: [...(row.buckets ?? []), row.status?.name ?? ''].filter(Boolean).join(', '),
			url: row.url ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('shine: no companies in the page payload');
	}

	return companies;
}
