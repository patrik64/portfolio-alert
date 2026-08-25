import type { ScrapedCompany } from './types';

// the companies page (Next.js over Sanity) only server-renders a "Featured"
// dozen — but the site's Sanity dataset answers public queries, and its
// company documents carry the name, a tagline that works as a category, and
// (for some) the company site among the links
const QUERY = encodeURIComponent(
	'*[_type=="company"]{name, descriptionShort, "site": links[label=="Website"][0].customUrl.external}'
);
const API_URL = `https://ls99cphb.apicdn.sanity.io/v2023-01-01/data/query/production?query=${QUERY}`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

interface CompanyDoc {
	name?: string;
	descriptionShort?: string;
	site?: string;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(API_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${API_URL}: ${resp.status}`);
	}
	const { result } = (await resp.json()) as { result?: CompanyDoc[] };

	const companies: ScrapedCompany[] = [];
	for (const doc of result ?? []) {
		const name = (doc.name ?? '').trim();
		if (!name) continue;
		companies.push({
			name,
			category: (doc.descriptionShort ?? '').trim(),
			url: (doc.site ?? '').trim()
		});
	}

	if (companies.length === 0) {
		throw new Error('zetta: no companies in the sanity dataset');
	}

	return companies;
}
