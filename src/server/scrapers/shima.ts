import type { ScrapedCompany } from './types';

const API_URL = 'https://api.shima.capital';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// the site is a nuxt app that ships an empty shell and fills it from its own
// api at api.shima.capital. two calls are enough: one for the companies and
// one to turn their category ids into the names the page shows —
// Gaming, DeFi, Analytics, Consumer, Infrastructure.
//
// the records carry isFreeze and isDelete flags; anything set is a company the
// fund has taken down, and is left out.

interface Category {
	id?: number;
	name?: string;
}

interface Company {
	name?: string;
	website?: string;
	categoryId?: number;
	isFreeze?: number;
	isDelete?: number;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

async function fetchJson(path: string) {
	const url = `${API_URL}${path}`;
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.json();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const [companyBody, categoryBody] = await Promise.all([
		fetchJson('/company/dropdown'),
		fetchJson('/category/dropdown')
	]);

	const categories = new Map<number, string>(
		((categoryBody?.data ?? []) as Category[])
			.filter((c) => typeof c.id === 'number' && c.name)
			.map((c) => [c.id as number, clean(c.name as string)])
	);

	const rows: Company[] = companyBody?.data ?? [];

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const row of rows) {
		if (row.isFreeze || row.isDelete) continue;
		const name = clean(row.name ?? '');
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({
			name,
			category: (row.categoryId !== undefined && categories.get(row.categoryId)) || '',
			url: row.website ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('shima: no companies in the investments api');
	}

	return companies;
}
