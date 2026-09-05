import type { ScrapedCompany } from './types';

const BASE_URL = 'https://lakehouse.vc';
const PAGE_URL = `${BASE_URL}/portfolio/`;
const BATCH_SIZE = 10;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a static astro site over sanity, the whole list server-rendered: every row
// names the company, gives the round the fund led, the month it came in and
// where the company sits, and links to a page of the company's own. that
// page is where the company's address lives — as its one link that leads off
// the site — so the rows are read first and the pages in batches after.

const ITEM = /<a href="(\/portfolio\/[^"]+)" class="company-list-item[^>]*data-date="(\d{4})[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
const NAME = /<h2 class="company-name"[^>]*>([^<]*)</;
const STAGE = /<span class="sans uppercase"[^>]*>\s*([^<]*)</;
const LOCATION = /class="company-location"[^>]*>\s*([^<]*)</;
const SITE = /href="(https?:\/\/[^"]+)"/g;
// the site's own furniture: anything here is not the company's address
const NOISE = /lakehouse|linkedin|twitter|instagram|facebook|youtube|sanity|jsdelivr|google/;

const clean = (s: string) => s.replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a place written "New York, NY" would read
// as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

async function fetchPage(url: string) {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await fetchPage(PAGE_URL);

	const rows = [...html.matchAll(ITEM)].map(([, path, year, body]) => ({
		path,
		year,
		name: clean(body.match(NAME)?.[1] ?? ''),
		stage: clean(body.match(STAGE)?.[1] ?? ''),
		location: clean(body.match(LOCATION)?.[1] ?? '')
	}));
	if (rows.length === 0) {
		throw new Error('lakehouse: no companies on the portfolio page');
	}

	const sites = new Map<string, string>();
	for (let i = 0; i < rows.length; i += BATCH_SIZE) {
		await Promise.all(
			rows.slice(i, i + BATCH_SIZE).map(async (row) => {
				try {
					const page = await fetchPage(`${BASE_URL}${row.path}`);
					const site = [...page.matchAll(SITE)].map((m) => m[1]).find((u) => !NOISE.test(u));
					if (site) sites.set(row.path, site);
				} catch {
					// the row already names the company; it just goes without its address
				}
			})
		);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const row of rows) {
		if (!row.name || seen.has(row.name.toLowerCase())) continue;
		seen.add(row.name.toLowerCase());
		companies.push({
			name: row.name,
			category: [tag(row.stage), tag(row.location), row.year].filter(Boolean).join(', '),
			url: sites.get(row.path) ?? ''
		});
	}

	return companies;
}
