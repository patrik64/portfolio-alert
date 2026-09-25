import type { ScrapedCompany } from './types';

const BASE_URL = 'https://eclipse.capital';
const PAGE_URL = `${BASE_URL}/companies`;
// the sanity project the site reads from, named in the page's head; its
// dataset is open to read
const QUERY_URL = 'https://5uq66tk5.api.sanity.io/v2023-01-01/data/query/production';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js over sanity: the companies page shows a few and leaves the rest
// to the browser, but sanity answers a query for every company document at
// once — the name, its site, the categories the fund files it under
// ("Advanced Compute"), the stages it has backed it at and the year it was
// founded. the fund marks no exits there; a company without a site links
// to its page on the fund's site.

const GROQ = `*[_type == "company" && defined(slug.current)]{
	title, "slug": slug.current, websiteURL, "categories": categories[]->name, companyStatus, foundedYear
} | order(title asc)`;
const STEALTH = /^stealth\b/i;

interface Doc {
	title?: string;
	slug?: string;
	websiteURL?: string;
	categories?: (string | null)[];
	companyStatus?: string[];
	foundedYear?: number;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// "early_stage" as Early stage
const stage = (s: string) => {
	const words = s.replace(/_/g, ' ').trim();
	return words ? words[0].toUpperCase() + words.slice(1) : '';
};

export async function scrape(): Promise<ScrapedCompany[]> {
	const url = `${QUERY_URL}?query=${encodeURIComponent(GROQ)}`;
	const resp = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	const docs = ((await resp.json()) as { result?: Doc[] }).result ?? [];

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const doc of docs) {
		const name = clean(doc.title ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			category: [
				...(doc.categories ?? []).map((c) => tag(c ?? '')),
				...(doc.companyStatus ?? []).map(stage),
				doc.foundedYear ? `Founded ${doc.foundedYear}` : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: clean(doc.websiteURL ?? '') || (doc.slug ? `${PAGE_URL}/${doc.slug}` : PAGE_URL)
		});
	}

	if (companies.length === 0) {
		throw new Error('eclipse: no companies in what sanity answers');
	}

	return companies;
}
