import type { ScrapedCompany } from './types';

const BASE_URL = 'https://cultiviansbx.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
// the collection behind the portfolio page, asked for as json
const COLLECTION_URL = `${BASE_URL}/companies?format=json`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace: the portfolio page summarises a collection of company posts,
// which asked for as json answers with every post — titled with the name,
// tagged with the fund that invested ("Fund III"), "Active" or "Exits", and
// with a body that links the company's social account and its site. a
// further page, were the collection to grow one, is asked for by the offset
// the answer names.

const LINK = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/g;
const NOISE = /cultiviansbx\.com|squarespace|twitter\.com|x\.com|linkedin\.com|facebook\.com|instagram\.com|youtube\.com/i;
const STEALTH = /^stealth\b/i;

interface Post {
	title?: string;
	fullUrl?: string;
	tags?: string[];
	body?: string;
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
		const tags = (post.tags ?? []).map(tag).filter((t) => t && !/^active$/i.test(t));
		const exited = tags.some((t) => /^exits?$/i.test(t));
		const site = [...(post.body ?? '').matchAll(LINK)].map((m) => unescape(m[1])).find((u) => !NOISE.test(u));
		companies.push({
			name,
			category: [...tags.filter((t) => !/^exits?$/i.test(t)), exited ? 'Exited' : '']
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: site || (post.fullUrl ? `${BASE_URL}${post.fullUrl}` : PAGE_URL)
		});
	}

	if (companies.length === 0) {
		throw new Error('cultivian: no companies in the portfolio collection');
	}

	return companies;
}
