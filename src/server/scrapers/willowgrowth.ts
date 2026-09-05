import type { ScrapedCompany } from './types';

const BASE_URL = 'https://willowgrowth.com';
const LIST_URL = `${BASE_URL}/wp-json/wp/v2/portfolio?per_page=100`;
const TERMS_URL = `${BASE_URL}/wp-json/wp/v2/portfolio_category?per_page=100`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the brands page fills its grid from the "portfolio" post type at
// runtime, so the served html holds no cards — the rest feed behind it is the
// list itself, with the sector as a portfolio_category term.
//
// neither the feed nor the brand pages link the companies' own sites (the fund
// publishes none), so each company points at its page on willowgrowth.com.

interface Term {
	id: number;
	name?: string;
}

interface Post {
	title?: { rendered?: string };
	link?: string;
	portfolio_category?: number[];
}

async function fetchJson(url: string): Promise<unknown> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.json();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const [posts, terms] = (await Promise.all([fetchJson(LIST_URL), fetchJson(TERMS_URL)])) as [
		Post[],
		Term[]
	];

	const sectors = new Map((terms ?? []).map((t) => [t.id, (t.name ?? '').trim()]));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const post of posts ?? []) {
		const name = (post.title?.rendered ?? '').trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({
			name,
			category: (post.portfolio_category ?? [])
				.map((id) => sectors.get(id) ?? '')
				.filter(Boolean)
				.join(', '),
			url: post.link ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('willowgrowth: no companies in the portfolio feed');
	}

	return companies;
}
