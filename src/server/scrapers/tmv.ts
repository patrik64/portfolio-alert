import type { ScrapedCompany } from './types';

// the companies page is drawn in the browser from the fund's sanity dataset,
// whose project and dataset the page's own image addresses name
const PROJECT = '7b1qa28r';
const DATASET = 'production';
const API_URL = `https://${PROJECT}.api.sanity.io/v2021-10-21/data/query/${DATASET}`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// the fund calls a portfolio company an "investment". its industries and the
// round it came in at are references, and are followed to their titles here.
// drafts share the dataset and are left out, so only what the site shows
// is counted.
const QUERY = `*[_type=="investment" && !(_id in path("drafts.**"))]{
	name, website, "stage": stage->title, "industries": industries[]->title
}`;

interface Investment {
	name?: string;
	website?: string;
	stage?: string | null;
	industries?: (string | null)[];
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const url = new URL(API_URL);
	url.searchParams.set('query', QUERY);

	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch the sanity dataset: ${resp.status}`);
	}
	const { result } = (await resp.json()) as { result?: Investment[] };

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const row of result ?? []) {
		// several names are stored with a trailing space
		const name = (row.name ?? '').trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({
			name,
			category: [...(row.industries ?? []).map((i) => (i ?? '').trim()), (row.stage ?? '').trim()]
				.filter(Boolean)
				.join(', '),
			url: (row.website ?? '').trim()
		});
	}

	if (companies.length === 0) {
		throw new Error('tmv: no investments in the sanity dataset');
	}

	return companies;
}
