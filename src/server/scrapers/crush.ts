import type { ScrapedCompany } from './types';

const BASE_URL = 'https://crush.ventures';
const PAGE_URL = `${BASE_URL}/#companies-anchor`;
// the collection behind the companies section, asked for as json
const COLLECTION_URL = `${BASE_URL}/portfolio-companies?format=json`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace: the home page shows a few companies, but the collection
// behind them, asked for as json, answers with every post — titled with the
// name, clicking through to the company's site, filed under sectors
// ("Creator Economy") and tagged with a stage, active or exited, and a
// location, with a line about it that names the buyer of one sold. the
// collection comes twenty at a time, the next page asked for by the offset
// the answer names.

const OUTCOME = /\b(acquired by [^.;,()]+|merged with [^.;,()]+|ipo)/i;
const STEALTH = /^stealth\b/i;

interface Post {
	title?: string;
	fullUrl?: string;
	clickthroughUrl?: string | null;
	sourceUrl?: string | null;
	categories?: string[];
	tags?: string[];
	excerpt?: string;
}

interface Listing {
	items?: Post[];
	pagination?: { nextPage?: boolean; nextPageOffset?: number };
}

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const posts: Post[] = [];
	let offset: number | undefined;
	for (let page = 0; page < 20; page++) {
		const url = `${COLLECTION_URL}${offset ? `&offset=${offset}` : ''}`;
		const resp = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${url}: ${resp.status}`);
		}
		const listing = (await resp.json()) as Listing;
		posts.push(...(listing.items ?? []));
		offset = listing.pagination?.nextPage ? listing.pagination.nextPageOffset : undefined;
		if (!offset) break;
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const post of posts) {
		const name = clean(post.title ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const tags = (post.tags ?? []).map(clean);
		const stage = tags.find((t) => /^stage\s*:/i.test(t))?.replace(/^stage\s*:\s*/i, '') ?? '';
		const location = tags.find((t) => /^location\s*:/i.test(t))?.replace(/^location\s*:\s*/i, '') ?? '';
		const outcome = clean(post.excerpt ?? '').match(OUTCOME)?.[1] ?? '';
		const exited = /exit/i.test(stage) || Boolean(outcome);
		// a site written plain ("www.manheadmerch.com") gets its scheme
		const site = clean(post.clickthroughUrl ?? post.sourceUrl ?? '').replace(/^(?=[\w-]+(\.[\w-]+)+)/, 'https://');
		companies.push({
			name,
			category: [
				...(post.categories ?? []).map(tag),
				tag(location),
				outcome ? tag(outcome[0].toUpperCase() + outcome.slice(1)) : '',
				exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: site || (post.fullUrl ? `${BASE_URL}${post.fullUrl}` : PAGE_URL)
		});
	}

	if (companies.length === 0) {
		throw new Error('crush: no companies in the portfolio collection');
	}

	return companies;
}
