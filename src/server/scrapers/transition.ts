import type { ScrapedCompany } from './types';

// the site draws its companies page in the browser from its sanity dataset;
// the project and dataset are named in the image addresses the page serves,
// and both are the fund's own public read-only ones
const PROJECT = 'rfnw7eew';
const DATASET = 'live';
const API_URL = `https://${PROJECT}.api.sanity.io/v2021-10-21/data/query/${DATASET}`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a company states the sectors it is in as references, the round the fund came
// in at, and where it works from. drafts live in the same dataset and are
// filtered out, so only what the site shows is counted.
const QUERY = `*[_type=="company" && !(_id in path("drafts.**"))]{
	title, website, location, stagePartnered, "sectors": sectors[]->title
}`;

interface Company {
	title?: string;
	website?: string;
	location?: string;
	stagePartnered?: string;
	sectors?: (string | null)[];
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const url = new URL(API_URL);
	url.searchParams.set('query', QUERY);

	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch the sanity dataset: ${resp.status}`);
	}
	const { result } = (await resp.json()) as { result?: Company[] };

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const row of result ?? []) {
		const name = (row.title ?? '').trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({
			name,
			category: [
				...(row.sectors ?? []).map((s) => (s ?? '').trim()),
				(row.stagePartnered ?? '').trim(),
				(row.location ?? '').trim()
			]
				.filter(Boolean)
				.join(', '),
			url: (row.website ?? '').trim()
		});
	}

	if (companies.length === 0) {
		throw new Error('transition: no companies in the sanity dataset');
	}

	return companies;
}
