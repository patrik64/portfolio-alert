import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.anorak.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wix: the portfolio page is a gallery of logos fed by a dataset, its
// records served whole in the page's data though the gallery draws only
// the first of them until the visitor scrolls. each record is a company's
// name, its site, a line about it, and the category, region and fund the
// page's dropdowns filter by ("AR/VR", "United States", "Fund 2"), kept as
// tags. a line that says the company "was acquired by" someone is how the
// fund got out, kept without the date. a dataset that comes in part fails
// the run.

const WARMUP = /<script\b[^>]*\bid="wix-warmup-data"[^>]*>([\s\S]*?)<\/script>/;
const ACQUIRED = /\bacquired by ([A-Z0-9][^.,;]*?)(?=\s+(?:on|in)\b|[.,;]|$)/;
const STEALTH = /^stealth\b/i;

interface Record {
	itemTitle?: string;
	itemLink?: string;
	itemDescription?: string;
	category?: string;
	location?: string;
	fund?: string;
}

interface DataStore {
	recordInfosByDatasetId?: {
		[dataset: string]: { itemIds?: string[]; datasetSize?: { total?: number; loaded?: number } };
	};
	recordsByCollectionId?: { [collection: string]: { [id: string]: Record } };
}

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const json = (await resp.text()).match(WARMUP)?.[1];
	if (!json) {
		throw new Error('anorak: no data served in the portfolio page');
	}
	const store = ((JSON.parse(json) as { appsWarmupData?: { dataBinding?: { dataStore?: DataStore } } })
		.appsWarmupData?.dataBinding?.dataStore ?? {}) as DataStore;
	const records = Object.values(store.recordsByCollectionId ?? {}).reduce<{ [id: string]: Record }>(
		(all, collection) => ({ ...all, ...collection }),
		{}
	);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [dataset, { itemIds = [], datasetSize = {} }] of Object.entries(store.recordInfosByDatasetId ?? {})) {
		if ((datasetSize.loaded ?? itemIds.length) < (datasetSize.total ?? 0)) {
			throw new Error(`anorak: dataset ${dataset} came with ${datasetSize.loaded} of its ${datasetSize.total} companies`);
		}
		for (const id of itemIds) {
			const record = records[id];
			const name = (record?.itemTitle ?? '').replace(/\s+/g, ' ').trim();
			if (!record || !name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			const buyer = (record.itemDescription ?? '').match(ACQUIRED)?.[1]?.trim();
			const site = (record.itemLink ?? '').trim();
			companies.push({
				name,
				category: [
					tag(record.category ?? ''),
					tag(record.location ?? ''),
					tag(record.fund ?? ''),
					buyer ? `Acquired by ${tag(buyer)}` : '',
					buyer ? 'Exited' : ''
				]
					.filter((t, i, all) => t && all.indexOf(t) === i)
					.join(', '),
				url: /^https?:\/\//i.test(site) ? site : PAGE_URL
			});
		}
	}
	if (companies.length === 0) {
		throw new Error('anorak: no companies in the portfolio data');
	}

	return companies;
}
