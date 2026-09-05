import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.wavemaker360.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wix, where the portfolio is a "Portfolio" collection behind a repeater. the
// listing page renders the repeater without naming anyone — a logo, a one-line
// description and a link to the company's page here — but each of those pages
// warms up its data store with the whole collection, names, websites and all.
//
// so the listing supplies the company pages, and the first of them supplies
// every company: two requests rather than one per company.

const WARMUP = /<script[^>]*id="wix-warmup-data"[^>]*>([\s\S]*?)<\/script>/;

interface Record {
	_id?: string;
	title?: string;
	website?: string;
	location?: string;
	investmentCategory?: string;
}

async function fetchPage(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

// the records sit under recordsByCollectionId.Portfolio, keyed by the id of
// the query that fetched them — a key not worth guessing, so the store is
// walked instead
function recordsIn(data: unknown): Record[] {
	const stores = (data as { appsWarmupData?: { dataBinding?: { dataStore?: unknown } } })
		?.appsWarmupData?.dataBinding?.dataStore;
	const found: Record[] = [];
	const visit = (node: unknown) => {
		if (Array.isArray(node)) {
			node.forEach(visit);
		} else if (node && typeof node === 'object') {
			const record = node as Record;
			// the collection's schema sits in the same payload and also has a
			// "title"; only a record carries an id alongside it
			if (typeof record.title === 'string' && typeof record._id === 'string') found.push(record);
			else Object.values(node).forEach(visit);
		}
	};
	visit(stores);
	return found;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const listing = await fetchPage(PAGE_URL);
	const slugs = [
		...new Set(
			[...listing.matchAll(/href="https:\/\/www\.wavemaker360\.com\/portfolio\/([^"/?]+)"/g)].map(
				(m) => m[1]
			)
		)
	];
	if (slugs.length === 0) {
		throw new Error('wavemaker360: no company pages on the portfolio page');
	}

	const detail = await fetchPage(`${PAGE_URL}/${slugs[0]}`);
	const warmup = detail.match(WARMUP)?.[1];
	if (!warmup) {
		throw new Error('wavemaker360: no warmup data on the company page');
	}
	const records = recordsIn(JSON.parse(warmup));
	if (records.length < slugs.length) {
		throw new Error(
			`wavemaker360: the company page carried ${records.length} of the ${slugs.length} companies`
		);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const record of records) {
		const name = (record.title ?? '').trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);
		// a company in two categories has them on separate lines
		const tags = (record.investmentCategory ?? '')
			.split('\n')
			.map((tag) => tag.trim())
			.filter(Boolean);
		const location = (record.location ?? '').trim();
		if (location) tags.push(location);
		companies.push({
			name,
			category: tags.join(', '),
			url: (record.website ?? '').trim()
		});
	}

	if (companies.length === 0) {
		throw new Error('wavemaker360: no companies in the portfolio collection');
	}

	return companies;
}
