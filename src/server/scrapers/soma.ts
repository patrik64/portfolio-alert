import type { ScrapedCompany } from './types';

const API_URL = 'https://somacap.com/api/trpc/companies.getCompaniesInfiniteQueryWithFilters';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const PER_PAGE = 100;
const MAX_PAGES = 40;

// the portfolio page ships three companies in its html — the fund's "legends"
// — and fetches the other eight hundred and seventy from a trpc endpoint as
// the reader scrolls. that endpoint is what is read here, walked by its own
// cursor until it stops offering one.
//
// the page hides five companies from the list it renders. they are hidden here
// too, so what is tracked is what the fund publishes.
//
// each company carries a region as well as its sectors, but the field mixes
// continents with cities — six hundred companies are filed under "US" and ten
// more under "SF" — so only the sectors are recorded.

// the fund's own exclusions, as its portfolio page lists them
const HIDDEN = new Set(['Cruise', 'Bolt', 'Sourceress', 'Prehire Inc (Interviewed)', 'Yhat, Inc.']);

interface Sector {
	name?: string;
	primary?: boolean;
}

interface Company {
	name?: string;
	website?: string;
	sectors?: Sector[];
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const rows: Company[] = [];
	let cursor: string | undefined;
	for (let page = 0; page < MAX_PAGES; page++) {
		const input = JSON.stringify({
			0: { json: cursor ? { limit: PER_PAGE, cursor } : { limit: PER_PAGE } }
		});
		const url = `${API_URL}?batch=1&input=${encodeURIComponent(input)}`;
		const resp = await fetch(url, { headers: { 'User-Agent': UA } });
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${API_URL}: ${resp.status}`);
		}
		const body = await resp.json();
		const data = body?.[0]?.result?.data?.json;
		const results: Company[] = data?.results ?? [];
		if (results.length === 0) break;
		rows.push(...results);
		cursor = data?.nextCursor ?? undefined;
		if (!cursor) break;
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const row of rows) {
		const name = clean(row.name ?? '');
		if (!name || HIDDEN.has(name) || seen.has(name)) continue;
		seen.add(name);

		// the sector the fund calls primary leads the rest
		const sectors = (row.sectors ?? []).filter((s) => s?.name);
		const ordered = [
			...sectors.filter((s) => s.primary).map((s) => clean(s.name!)),
			...sectors.filter((s) => !s.primary).map((s) => clean(s.name!))
		];

		companies.push({
			name,
			category: [...new Set(ordered)].filter(Boolean).join(', '),
			url: row.website ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('soma: no companies in the portfolio api');
	}

	return companies;
}
