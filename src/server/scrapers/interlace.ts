import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.interlacevc.com';
const TOKENS_URL = `${BASE_URL}/_api/v1/access-tokens`;
const QUERY_URL = `${BASE_URL}/_api/cloud-data/v2/items/query`;

// wix, the same way lytical ventures works: visitor tokens open the data
// api, and one query returns the Portfolio collection with every company's
// name, address, description and the fund's commerce themes. a name may
// trail an asterisk with "(acq.)" for an acquisition — that becomes the
// Exited tag — or an "(fka ...)" note recording a rename, and neither is
// part of the name. "Other" is the theme that says nothing.

interface Item {
	data?: {
		title?: string;
		url?: string;
		// a single theme is a string, several come as an array
		theme?: string | string[];
	};
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const tag = (s: string) => clean(s);

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
		throw new Error('interlace: no app token to query the cms with');
	}

	const resp = await fetch(QUERY_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: instance },
		body: JSON.stringify({ dataCollectionId: 'Portfolio', query: { paging: { limit: 1000 } } })
	});
	if (!resp.ok) {
		throw new Error(`Failed to query ${QUERY_URL}: ${resp.status}`);
	}
	const { dataItems } = (await resp.json()) as { dataItems?: Item[] };

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of dataItems ?? []) {
		const raw = clean(item.data?.title ?? '');
		const exited = /\(acq\.?\)/i.test(raw);
		const name = clean(
			raw
				.replace(/\(acq\.?\)/gi, '')
				.replace(/\(fka [^)]*\)/gi, '')
				.replace(/\*+/g, '')
		);
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const theme = item.data?.theme ?? [];
		const themes = Array.isArray(theme) ? theme : theme.split(',');
		companies.push({
			name,
			category: [
				...themes.map(tag).filter((t) => t && !/^other$/i.test(t)),
				exited ? 'Exited' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: clean(item.data?.url ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('interlace: no companies in the cms collection');
	}

	return companies;
}
