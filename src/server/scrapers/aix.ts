import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.aixventures.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace: the portfolio page is a blog collection, a post for each
// company, its logo linking straight through to the company's site, filed
// under a stage ("Early Stage", "Growth Stage", "Unicorn", or "Exited" for
// the ones the fund is out of) and tagged with its sector ("Enterprise").
// squarespace serves the collection as json at the page's own address,
// which is read here, with its pages followed should it ever have more
// than one; the stage and the sectors are kept as tags.

const STEALTH = /^stealth\b/i;
const MAX_PAGES = 20;

interface Item {
	title?: string;
	sourceUrl?: string;
	fullUrl?: string;
	categories?: string[];
	tags?: string[];
}

interface Collection {
	items?: Item[];
	pagination?: { nextPage?: boolean; nextPageUrl?: string };
}

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => unescape(s).replace(/\s+/g, ' ').trim().replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const items: Item[] = [];
	let url: string | undefined = `${PAGE_URL}?format=json`;
	for (let page = 0; url && page < MAX_PAGES; page++) {
		const resp = await fetch(url, { headers: { 'User-Agent': UA } });
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${url}: ${resp.status}`);
		}
		const collection = (await resp.json()) as Collection;
		items.push(...(collection.items ?? []));
		const next = collection.pagination?.nextPage ? collection.pagination.nextPageUrl : undefined;
		url = next ? `${new URL(next, BASE_URL).href}${next.includes('?') ? '&' : '?'}format=json` : undefined;
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of items) {
		const name = unescape(item.title ?? '')
			.replace(/\s+/g, ' ')
			.trim();
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const stages = (item.categories ?? []).map(tag);
		const exited = stages.some((stage) => /^exited$/i.test(stage));
		const site = (item.sourceUrl ?? '').trim();
		companies.push({
			name,
			category: [...(item.tags ?? []).map(tag), ...stages.filter((stage) => !/^exited$/i.test(stage)), exited ? 'Exited' : '']
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : item.fullUrl ? new URL(item.fullUrl, BASE_URL).href : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('aix: no companies in the portfolio collection');
	}

	return companies;
}
