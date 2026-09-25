import type { ScrapedCompany } from './types';

const BASE_URL = 'https://elaia.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
// the payload cms behind the site answers for the whole collection at once
const API_URL = `${BASE_URL}/api/portfolio?limit=500&depth=1`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js over payload cms: the portfolio page renders a first few rows and
// leaves the rest to the browser, but the cms answers at /api/portfolio with
// every company — the name, its sectors ("AI & Machine Learning") and
// countries, its site and a status, active or exited — a page at a time,
// which is followed to the last.

const STEALTH = /^stealth\b/i;

interface Doc {
	name?: string;
	slug?: string;
	companyStatus?: string;
	sector?: { title?: string }[];
	geography?: { title?: string }[];
	website?: { url?: string } | null;
	_status?: string;
}

interface Page {
	docs?: Doc[];
	hasNextPage?: boolean;
	nextPage?: number | null;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const titles = (items: { title?: string }[] | undefined) => (items ?? []).map((item) => tag(item.title ?? ''));

export async function scrape(): Promise<ScrapedCompany[]> {
	const docs: Doc[] = [];
	let page: number | null = 1;
	while (page && page <= 20) {
		const url = `${API_URL}&page=${page}`;
		const resp = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${url}: ${resp.status}`);
		}
		const data = (await resp.json()) as Page;
		docs.push(...(data.docs ?? []));
		page = data.hasNextPage && data.nextPage ? data.nextPage : null;
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const doc of docs) {
		const name = clean(doc.name ?? '');
		if (!name || doc._status === 'draft' || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			category: [
				...titles(doc.sector),
				...titles(doc.geography),
				doc.companyStatus?.toLowerCase() === 'exited' ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: clean(doc.website?.url ?? '') || (doc.slug ? `${PAGE_URL}/${doc.slug}` : PAGE_URL)
		});
	}

	if (companies.length === 0) {
		throw new Error('elaia: no companies in the portfolio collection');
	}

	return companies;
}
