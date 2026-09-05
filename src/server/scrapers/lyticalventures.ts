import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.lyticalventures.com';
const TOKENS_URL = `${BASE_URL}/_api/v1/access-tokens`;
const QUERY_URL = `${BASE_URL}/_api/cloud-data/v2/items/query`;

// wix. the page draws its wall from a cms collection called Projects
// ("Companies" in the editor), and the site hands any visitor short-lived app
// tokens at /_api/v1/access-tokens — the same way the browser gets them; any
// app's token opens the data api. one query then returns every company with
// the fields the tiles are drawn from: the name, the company's own address,
// its hq, and an ACQUIRED mark on the ones the fund is out of. the rendered
// page carries only name and description, so the collection is the better
// source, not just the easier one.

interface Item {
	data?: {
		title?: string;
		url?: string;
		where?: string;
		// the collection's own spelling
		acuqiredYN?: string;
	};
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so an hq written "Cork, Ireland" would read
// as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

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
		throw new Error('lyticalventures: no app token to query the cms with');
	}

	const resp = await fetch(QUERY_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: instance },
		body: JSON.stringify({ dataCollectionId: 'Projects', query: { paging: { limit: 1000 } } })
	});
	if (!resp.ok) {
		throw new Error(`Failed to query ${QUERY_URL}: ${resp.status}`);
	}
	const { dataItems } = (await resp.json()) as { dataItems?: Item[] };

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of dataItems ?? []) {
		const name = clean(item.data?.title ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const exited = /acquired/i.test(item.data?.acuqiredYN ?? '');
		companies.push({
			name,
			category: [tag(item.data?.where ?? ''), exited ? 'Exited' : ''].filter(Boolean).join(', '),
			url: clean(item.data?.url ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('lyticalventures: no companies in the cms collection');
	}

	return companies;
}
