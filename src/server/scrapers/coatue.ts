import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.coatue.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
// what the page's "load more" asks for: the next companies of its grid
const MORE_URL = `${BASE_URL}/api/portfolio`;
const PACE_MS = 150;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next over contentful: the full portfolio page ships the first four dozen
// of its companies in the data it renders from (__NEXT_DATA__), with the
// count of all of them, and its "load more" asks the site's own route for
// the rest, four dozen at a time from where the list stands. a company is
// its name, its site, the stage the fund first came in at ("Venture" or
// "Growth") and a status, "Active" or "Exit". the page covers, it says, all
// current and exited private investments across the funds coatue manages.
// a part of the list that will not come fails the run, rather than take a
// part of the portfolio for the whole.

const DATA = /<script\b[^>]*\bid="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;
const STEALTH = /^stealth\b/i;

interface Item {
	name?: string;
	url?: string | null;
	type?: string | null;
	status?: string | null;
}

interface Grid {
	__typename?: string;
	sys?: { id?: string };
	itemsCollection?: { total?: number; items?: Item[] };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const payload = (await resp.text()).match(DATA)?.[1];
	if (!payload) {
		throw new Error('coatue: the portfolio page carries no data');
	}
	const sections = (JSON.parse(payload) as {
		props?: { pageProps?: { page?: { sectionsCollection?: { items?: Grid[] } } } };
	}).props?.pageProps?.page?.sectionsCollection?.items;
	const grid = sections?.find((s) => s?.__typename === 'PortfolioGrid');
	const id = grid?.sys?.id;
	if (!grid || !id) {
		throw new Error('coatue: the portfolio page carries no portfolio grid');
	}

	const items = [...(grid.itemsCollection?.items ?? [])];
	let total = grid.itemsCollection?.total ?? items.length;
	while (items.length < total) {
		await wait(PACE_MS);
		const url = `${MORE_URL}?id=${encodeURIComponent(id)}&skip=${items.length}`;
		const more = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
		if (!more.ok) {
			throw new Error(
				`coatue: the rest of the portfolio would not load (${more.status} at ${items.length} of ${total})`
			);
		}
		const page = (await more.json()) as { total?: number; items?: Item[] };
		if (!page.items?.length) {
			throw new Error(`coatue: the portfolio stopped at ${items.length} of ${total}`);
		}
		items.push(...page.items);
		total = page.total ?? total;
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of items) {
		const name = (item?.name ?? '').replace(/\s+/g, ' ').trim();
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const exited = /^exit/i.test(item.status ?? '');
		const site = (item.url ?? '').trim();
		companies.push({
			name,
			category: [tag(item.type ?? ''), exited ? 'Exited' : ''].filter(Boolean).join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('coatue: no companies in the portfolio');
	}

	return companies;
}
