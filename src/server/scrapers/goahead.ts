import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.goaheadvc.com';
const API_URL = `${BASE_URL}/api/portfolio-layout`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js, the portfolio drawn in the browser: the "all" page arrives saying
// only "Loading…" and fills itself from the site's own api, one list of every
// company with its name, its site, its sectors and the city it works from,
// and a flag for the ones the fund keeps off the page, which are left out
// here as the page leaves them out. nothing says which companies the fund is
// out of.

const STEALTH = /^stealth\b/i;

interface Entry {
	name?: string;
	site?: string | null;
	sectors?: string[] | null;
	city?: string | null;
	hidden?: boolean | null;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
// ("Washington, D.C.")
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(API_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${API_URL}: ${resp.status}`);
	}
	const entries = (await resp.json()) as Entry[];
	if (!Array.isArray(entries)) {
		throw new Error('goahead: the portfolio api answered with no list');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const entry of entries) {
		if (entry.hidden === true) continue;
		const name = clean(entry.name ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const site = clean(entry.site ?? '');
		companies.push({
			name,
			category: [...(entry.sectors ?? []).map(tag), tag(entry.city ?? '')]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : ''
		});
	}

	if (companies.length === 0) {
		throw new Error('goahead: the portfolio api lists no companies');
	}

	return companies;
}
