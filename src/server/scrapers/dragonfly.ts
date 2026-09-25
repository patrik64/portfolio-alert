import type { ScrapedCompany } from './types';

const BASE_URL = 'https://dragonfly.com';
const PAGE_URL = `${BASE_URL}/#portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// nuxt over a headless cms, one page: the portfolio is a section of the
// home page, filled from a payload the page names (its address changes per
// build, so it is read off the page each run) — one flat array that
// objects point into by index, holding a portfolio item per company, some
// twice over for the different lists: the name, the category the fund
// files it under ("Stablecoin") and a "View Site" link. nothing marks an
// exit.

const PAYLOAD = /\bhref="(\/_payload\.json\?[^"]+)"/;
const STEALTH = /^stealth\b/i;

type Entry = unknown;

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// what an index points at, resolved a level down for an object
const at = (data: Entry[], value: Entry): Entry =>
	typeof value === 'number' ? data[value] : value;
const text = (data: Entry[], value: Entry): string => {
	const entry = at(data, value);
	return typeof entry === 'string' ? entry : '';
};
const object = (data: Entry[], value: Entry): Record<string, Entry> => {
	const entry = at(data, value);
	return entry && typeof entry === 'object' && !Array.isArray(entry) ? (entry as Record<string, Entry>) : {};
};

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const page = await fetchText(`${BASE_URL}/`);
	const path = page.match(PAYLOAD)?.[1];
	if (!path) {
		throw new Error('dragonfly: the page names no payload to read the portfolio from');
	}
	const data = JSON.parse(await fetchText(new URL(path.replace(/&amp;/g, '&'), BASE_URL).href)) as Entry[];

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const entry of data) {
		const record = object(data, entry);
		if (text(data, record._type) !== 'portfolioItem') continue;
		const name = clean(text(data, record.title));
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const link = object(data, record.link);
		companies.push({
			name,
			category: tag(text(data, record.categoryLabel)),
			url: clean(text(data, link.linkHref)) || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('dragonfly: no portfolio items in the payload');
	}

	return companies;
}
