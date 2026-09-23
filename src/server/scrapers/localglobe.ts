import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.phoenixcourt.vc';
// localglobe is one of the phoenix court group's funds, and the group's site
// lists every company under all of them — this filter keeps the fund the
// registry names
const FUND = 'localglobe';
const LIST_URL = `${BASE_URL}/companies?fund=${FUND}`;
const MAX_PAGES = 20;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// the group rebuilt its site in next.js in september 2026, and the json apis
// the old one drew from went with it. the companies page now arrives with its
// rows in the react flight payload, fifty to a page, filtered by fund and
// paged in the query string: a row names the company, its sector, the cities
// it works from (as slugs, spelled out by the filter lists on the same page),
// the stage and year the group came in, and the company's own site. a page
// past the last one answers with the last one again, so the walk stops at the
// first page that brings nobody new.

interface Row {
	uuid?: string;
	slug?: string;
	name?: string;
	sector?: string;
	locations?: string[];
	stage?: string;
	website?: string;
}

const PUSH = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
const ROWS = '{"rows":[';
// the filter lists, [["slug","Label"], …], for sectors, funds, stages, cities
const OPTIONS = /\[\["[a-z0-9-]+","[^"\\]*"\](?:,\["[a-z0-9-]+","[^"\\]*"\])+\]/g;

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

function payloadOf(html: string): string {
	return [...html.matchAll(PUSH)]
		.map((m) => {
			try {
				return JSON.parse(m[1]) as string;
			} catch {
				return '';
			}
		})
		.join('');
}

// the rows are one array written into the payload, read to where its own
// brackets balance, strings aside
function rowsOf(payload: string): Row[] {
	const at = payload.indexOf(ROWS);
	if (at < 0) return [];
	const start = at + ROWS.length - 1;
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let i = start; i < payload.length; i++) {
		const c = payload[i];
		if (inString) {
			if (escaped) escaped = false;
			else if (c === '\\') escaped = true;
			else if (c === '"') inString = false;
		} else if (c === '"') inString = true;
		else if (c === '[') depth++;
		else if (c === ']' && --depth === 0) {
			try {
				return JSON.parse(payload.slice(start, i + 1)) as Row[];
			} catch {
				return [];
			}
		}
	}
	return [];
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const rows = new Map<string, Row>();
	const labels = new Map<string, string>();

	for (let page = 1; page <= MAX_PAGES; page++) {
		const url = page === 1 ? LIST_URL : `${LIST_URL}&page=${page}`;
		const resp = await fetch(url, { headers: { 'User-Agent': UA } });
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${url}: ${resp.status}`);
		}
		const payload = payloadOf(await resp.text());
		if (page === 1) {
			for (const list of payload.match(OPTIONS) ?? []) {
				try {
					for (const [slug, label] of JSON.parse(list) as [string, string][]) labels.set(slug, label);
				} catch {
					// a list that will not parse only costs the cities their spelling
				}
			}
		}

		let fresh = 0;
		for (const row of rowsOf(payload)) {
			const id = row.uuid ?? row.slug ?? row.name ?? '';
			if (!id || rows.has(id)) continue;
			rows.set(id, row);
			fresh++;
		}
		if (fresh === 0) break;
	}

	if (rows.size === 0) {
		throw new Error('localglobe: the companies page carried no rows — the payload moved');
	}

	const place = (slug: string) =>
		labels.get(slug) ?? slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const row of rows.values()) {
		const name = clean(row.name ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			category: [
				tag(row.sector ?? ''),
				...(row.locations ?? []).map((slug) => tag(place(slug))),
				tag(row.stage ?? '')
			]
				.filter(Boolean)
				.join(', '),
			url: clean(row.website ?? '') || (row.slug ? `${BASE_URL}/companies/${row.slug}` : '')
		});
	}

	return companies;
}
