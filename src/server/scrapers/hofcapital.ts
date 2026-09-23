import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://hofcapital.com/portfolio';
// gatsby publishes each page's data beside it
const DATA_URL = 'https://hofcapital.com/page-data/portfolio/page-data.json';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a gatsby site, whose portfolio page is built from a list of companies in its
// page data: each with its name, its site, the fund's sectors for it, and
// whether it is published — an unpublished one is not on the page, and is
// left out here too. "Publicly Listed" is filed as a sector; a listing is how
// the other scrapers here mark an exit, so it brings the Exited tag.

interface Item {
	title?: string;
	companylink?: string;
	sectors?: string[];
	published?: boolean;
}

interface PageData {
	result?: { data?: { companies?: { frontmatter?: { portfolioitems?: Item[] } } } };
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(DATA_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${DATA_URL}: ${resp.status}`);
	}
	const items = ((await resp.json()) as PageData).result?.data?.companies?.frontmatter?.portfolioitems;
	if (!Array.isArray(items)) {
		throw new Error(`hofcapital: the page data behind ${PAGE_URL} holds no portfolio items`);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of items) {
		if (item.published === false) continue;
		const name = clean(item.title ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const sectors = (item.sectors ?? []).map(tag).filter(Boolean);
		companies.push({
			name,
			category: [...sectors, sectors.some((s) => /publicly listed/i.test(s)) ? 'Exited' : '']
				.filter(Boolean)
				.join(', '),
			url: clean(item.companylink ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('hofcapital: no published companies in the page data');
	}

	return companies;
}
