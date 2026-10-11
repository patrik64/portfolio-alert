import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.mangrove.vc/our-portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wix: the portfolio page is a repeater of logos drawn from a collection
// of the site's own ("OurDeals"), which wix renders on its server and hands
// the page as warmup data — the collection's records, each a company's
// name, its site and its industries ("B2B, SaaS, Enterprise"), and the
// repeater's items, by the records' ids, in the order the page shows them.
// the repeater, which decides who is listed, is found as the element whose
// items are the collection's records, so a change to the design's element
// ids does not lose it. the industries are kept as tags; the page does not
// say which companies the fund is out of.

const WARMUP = /<script\b[^>]*\bid="wix-warmup-data"[^>]*>([\s\S]*?)<\/script>/;
const COLLECTION = 'OurDeals';
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

interface Deal {
	title?: string;
	url?: string;
	industry?: string;
}

interface Warmup {
	platform?: { ssrPropsUpdates?: Record<string, { items?: unknown }>[] };
	appsWarmupData?: { dataBinding?: { dataStore?: { recordsByCollectionId?: Record<string, Record<string, Deal>> } } };
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const json = (await resp.text()).match(WARMUP)?.[1];
	let warmup: Warmup;
	try {
		warmup = JSON.parse(json ?? '') as Warmup;
	} catch {
		throw new Error("mangrove: the page carries no warmup data — wix's page moved");
	}

	const records = warmup.appsWarmupData?.dataBinding?.dataStore?.recordsByCollectionId?.[COLLECTION] ?? {};
	// the repeater: the element whose items are all records of the collection
	const items = (warmup.platform?.ssrPropsUpdates ?? [])
		.flatMap((update) => Object.values(update))
		.map((props) => props?.items)
		.find(
			(list): list is string[] =>
				Array.isArray(list) && list.length > 0 && list.every((id) => typeof id === 'string' && id in records)
		);
	if (!items) {
		throw new Error(`mangrove: no repeater on the page shows the ${COLLECTION} collection`);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const id of items) {
		const deal = records[id];
		const name = clean(deal.title ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const site = clean(deal.url ?? '');
		companies.push({
			name,
			category: (deal.industry ?? '')
				.split(',')
				.map(clean)
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error(`mangrove: the ${COLLECTION} repeater shows no companies`);
	}

	return companies;
}
