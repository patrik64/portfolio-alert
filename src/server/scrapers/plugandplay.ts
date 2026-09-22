import type { ScrapedCompany } from './types';

const BASE_API = 'https://public.dxp.playbook.vc/.rest/delivery/startups/v1';
// the catalogue is served from several nodes that hold it in different
// orders, so an offset means nothing unless the query names a sort: asked
// without one, deep pages come back shuffled, and a walk collects some
// companies twice and misses others — a different arbitrary three quarters
// of the catalogue each run, which the nightly fetch then reported as
// newcomers. ordering by the node name, which is unique, makes the pages
// repeatable and the walk complete.
const ORDER = encodeURIComponent('@name asc');
const PER_PAGE = 100;
const MAX_PAGES = 200;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

interface Startup {
	'@name'?: string;
	startupTitle?: string;
	startupWebsite?: string;
	startupMainIndustry?: { industryTitle?: string };
}

interface Page {
	total?: number;
	results?: Startup[];
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const byNode = new Map<string, Startup>();
	let total = 0;

	for (let page = 0; page < MAX_PAGES; page++) {
		const offset = page * PER_PAGE;
		const resp = await fetch(`${BASE_API}?limit=${PER_PAGE}&offset=${offset}&orderBy=${ORDER}`, {
			headers: { 'User-Agent': UA }
		});
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${BASE_API} at offset ${offset}: ${resp.status}`);
		}
		const data = (await resp.json()) as Page;
		total = data.total ?? total;
		const results = data.results ?? [];
		if (results.length === 0) break;
		for (const startup of results) {
			// the node name identifies the record; the title is a company's own
			// and two companies now and then share one
			byNode.set(startup['@name'] ?? `${offset}:${byNode.size}`, startup);
		}
		if (offset + results.length >= total) break;
	}

	// a walk that came up short would make newcomers of everything it missed
	// on the next run that finds them
	if (total > 0 && byNode.size < total * 0.95) {
		throw new Error(`plugandplay: read ${byNode.size} of the ${total} startups listed`);
	}

	const companies: ScrapedCompany[] = [];
	for (const startup of byNode.values()) {
		const name = clean(startup.startupTitle ?? '');
		if (!name) continue;
		companies.push({
			name,
			category: clean(startup.startupMainIndustry?.industryTitle ?? ''),
			url: clean(startup.startupWebsite ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('plugandplay: the catalogue listed no startups');
	}

	return companies;
}
