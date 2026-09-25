import type { ScrapedCompany } from './types';

const BASE_URL = 'https://dynamo.vc';
const PAGE_URL = `${BASE_URL}/startup-investment-portfolio`;
// the payload cms behind the site answers for the whole collection at once
const API_URL = `${BASE_URL}/api/companies?limit=200&depth=1`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js over payload cms: the portfolio page renders a first score of
// cards and leaves the rest to the browser, but the cms answers at
// /api/companies with every company — the name, its site, where it is
// based, the category the fund files it under ("Last Mile"), the fund that
// invested and a stage, which for one the fund is out of reads "Exited",
// and for one that folded "Shut Down"; a few are placeholders named
// "Stealth", which are left out. the pages of the listing are followed to
// the last.

const STEALTH = /^stealth\b/i;

interface Labelled {
	label?: string;
}

interface Doc {
	name?: string;
	website?: string;
	location?: string;
	category?: Labelled | string | null;
	stage?: Labelled | string | null;
	fund?: Labelled | string | null;
	_status?: string;
}

interface Page {
	docs?: Doc[];
	hasNextPage?: boolean;
	nextPage?: number | null;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a place written "Denver, CO" would read
// as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const label = (value: Labelled | string | null | undefined) =>
	tag(typeof value === 'string' ? value : (value?.label ?? ''));

export async function scrape(): Promise<ScrapedCompany[]> {
	const docs: Doc[] = [];
	let page: number | null = 1;
	while (page && page <= 20) {
		const url = `${API_URL}&page=${page}`;
		const resp = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${url}: ${resp.status}`);
		}
		const data = (await resp.json()) as Page;
		docs.push(...(data.docs ?? []));
		page = data.hasNextPage && data.nextPage ? data.nextPage : null;
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const doc of docs) {
		const name = clean(doc.name ?? '');
		if (!name || doc._status === 'draft' || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const stage = label(doc.stage);
		const exited = /^exited$/i.test(stage);
		const site = clean(doc.website ?? '').replace(/^(?=[\w-]+(\.[\w-]+)+)/, 'https://');
		companies.push({
			name,
			category: [label(doc.category), tag(doc.location ?? ''), label(doc.fund), exited ? 'Exited' : stage]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: site || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('dynamo: no companies in the portfolio collection');
	}

	return companies;
}
