import type { ScrapedCompany } from './types';

const BASE_URL = 'https://foundersfactory.com';
const PAGE_URL = `${BASE_URL}/portfolio/`;
// gatsby keeps each page's data beside it, naming the queries it shares
const DATA_URL = `${BASE_URL}/page-data/portfolio/page-data.json`;
const QUERY_URL = (hash: string) => `${BASE_URL}/page-data/sq/d/${hash}.json`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// gatsby over airtable: the portfolio page shows thirty companies and
// draws the rest in the browser from the records of a query the page
// shares, kept in a file of its own named by the query's hash. the page's
// data names its queries; the one holding the companies — each a name, its
// sectors ("Fintech", "Industrial & Climate"), its country, its site and
// whether it came through the accelerator or was built in the studio — is
// the largest of the record lists. the sectors, the country and the
// programme are kept as tags; the page does not say which companies are
// sold or gone.

// an address written without its scheme: "www.xcentric.tech"
const BARE = /^(?:www\.)?[\w-]+(?:\.[\w-]+)+(?:[/?#]\S*)?$/i;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

interface Entry {
	data?: {
		name?: string | null;
		sectors?: string[] | null;
		location?: string | null;
		link?: string | null;
		investmentType?: string | null;
	};
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

async function json<T>(url: string): Promise<T> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return (await resp.json()) as T;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const page = await json<{ staticQueryHashes?: string[] }>(DATA_URL);
	const hashes = page.staticQueryHashes ?? [];

	// the companies: the largest list of records carrying a programme
	let records: Entry[] = [];
	for (const hash of hashes) {
		const query = await json<{ data?: { records?: { nodes?: Entry[] } } }>(QUERY_URL(hash));
		const nodes = query.data?.records?.nodes ?? [];
		if (nodes.length > records.length && nodes.some((node) => node?.data?.investmentType)) records = nodes;
	}
	if (records.length === 0) {
		throw new Error("foundersfactory: none of the page's queries holds the portfolio — the page moved");
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const record of records) {
		const data = record?.data ?? {};
		const name = clean(data.name ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const written = clean(data.link ?? '');
		const site = BARE.test(written) ? `https://${written}` : written;
		companies.push({
			name,
			category: [...(data.sectors ?? []).map((s) => tag(s ?? '')), tag(data.location ?? ''), tag(data.investmentType ?? '')]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('foundersfactory: the portfolio names no companies');
	}

	return companies;
}
