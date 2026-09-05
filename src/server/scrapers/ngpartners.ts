import type { ScrapedCompany } from './types';

const API_URL = 'https://ngpartners.cdn.prismic.io/api/v2';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js over prismic, and the cms is open — no token, unlike neotribe's. the
// portfolio page itself is served with only the first six companies in it and
// walks the rest six at a time behind a Load More, so the cms is asked
// directly rather than the button being worked through: fifty-one company
// documents against the page's own count of nine pages of six, which is the
// same fifty-one.
//
// what the fund calls a sector doubles as what became of a company: alongside
// Future of Electric and Operational Efficiency sits Exits, and eleven
// companies are filed under it. a company has exactly one, so the category is
// that one word, kept as the fund writes it.
//
// the sector is only a reference inside a company, so the sector documents are
// read too and joined on their id. one company is filed under no sector at all
// and one has no address; both are kept as they are.
//
// the description the fund writes is prose — where the company is, what it
// does, and who bought it where that happened — rather than anything that
// would read as a label, so it is left where it is.

interface Link {
	id?: string;
	url?: string;
}
interface Doc {
	id?: string;
	data?: {
		name?: string;
		sector?: Link;
		ctaLink?: Link;
	};
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

async function fetchJson<T>(url: string): Promise<T> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return (await resp.json()) as T;
}

// every document of one type, however many pages the cms answers in
async function documents(ref: string, type: string): Promise<Doc[]> {
	const docs: Doc[] = [];
	for (let page = 1, pages = 1; page <= pages; page++) {
		const query = new URLSearchParams({
			ref,
			q: `[[at(document.type,"${type}")]]`,
			pageSize: '100',
			page: String(page)
		});
		const found = await fetchJson<{ total_pages: number; results: Doc[] }>(
			`${API_URL}/documents/search?${query}`
		);
		pages = found.total_pages;
		docs.push(...found.results);
	}
	return docs;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const master = (
		await fetchJson<{ refs: { isMasterRef?: boolean; ref: string }[] }>(API_URL)
	).refs.find((ref) => ref.isMasterRef)?.ref;
	if (!master) {
		throw new Error('ngpartners: the cms lists no master ref');
	}

	const sectors = new Map<string, string>();
	for (const sector of await documents(master, 'company-sector')) {
		const name = clean(sector.data?.name ?? '');
		if (sector.id && name) sectors.set(sector.id, name);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const doc of await documents(master, 'company')) {
		const name = clean(doc.data?.name ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const sector = doc.data?.sector?.id;
		companies.push({
			name,
			category: (sector && sectors.get(sector)) || '',
			url: doc.data?.ctaLink?.url ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('ngpartners: no companies in the cms');
	}

	return companies;
}
