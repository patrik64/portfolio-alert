import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.kittyhawkvc.com';
const TOKENS_URL = `${BASE_URL}/_api/v1/access-tokens`;
const QUERY_URL = `${BASE_URL}/_api/cloud-data/v2/items/query`;

// wix, the same way lytical ventures works: the site hands any visitor
// short-lived app tokens and one query returns the Portfolio1 collection.
// a company's row carries its name, the round, its sectors and its own
// address; the stage and sector fields end in "All Stages" and "All
// Sectors" so the site's filter can match everything, and that filler is
// stripped. the fund's stealth rows are named Confidential and are left out
// until it says who they are, and the collection also holds rows of another
// shape entirely, which carry no company and are skipped.

interface Item {
	data?: {
		company?: string;
		stage?: string;
		richtext?: string;
		url?: string;
	};
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// "Seed, All Stages" and "Healthcare, All Sectors" are filter values; the
// filler goes, the rest become tags
const tags = (s: string) =>
	clean(s)
		.split(',')
		.map((t) => t.trim())
		.filter((t) => t && !/^All (Stages|Sectors|Funds)$/i.test(t));

export async function scrape(): Promise<ScrapedCompany[]> {
	const tokensResp = await fetch(TOKENS_URL);
	if (!tokensResp.ok) {
		throw new Error(`Failed to fetch ${TOKENS_URL}: ${tokensResp.status}`);
	}
	const { apps } = (await tokensResp.json()) as {
		apps?: Record<string, { instance?: string }>;
	};
	const instance = Object.values(apps ?? {})[0]?.instance;
	if (!instance) {
		throw new Error('kittyhawk: no app token to query the cms with');
	}

	const resp = await fetch(QUERY_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: instance },
		body: JSON.stringify({ dataCollectionId: 'Portfolio1', query: { paging: { limit: 1000 } } })
	});
	if (!resp.ok) {
		throw new Error(`Failed to query ${QUERY_URL}: ${resp.status}`);
	}
	const { dataItems } = (await resp.json()) as { dataItems?: Item[] };

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of dataItems ?? []) {
		const name = clean(item.data?.company ?? '');
		if (!name || /^confidential$/i.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({
			name,
			category: [...tags(item.data?.richtext ?? ''), ...tags(item.data?.stage ?? '')].join(', '),
			url: clean(item.data?.url ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('kittyhawk: no companies in the cms collection');
	}

	return companies;
}
