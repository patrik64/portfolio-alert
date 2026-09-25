import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.differential.vc';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace, the portfolio kept as a blog: asked for the page as json, the
// site answers with every post — a company each, titled with its name,
// filed under categories that mix the sectors the fund invests behind
// ("MLOps & Platforms") with its standing ("Active", "Acquired"), and with
// a body whose first link is the company's site. a further page, were the
// blog to grow one, is asked for by the offset the answer names.

const LINK = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/g;
const NOISE = /differential\.vc|squarespace|linkedin\.com|twitter\.com|x\.com|crunchbase\.com/i;
const STEALTH = /^stealth\b/i;

interface Post {
	title?: string;
	fullUrl?: string;
	categories?: string[];
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
		const url = `${PAGE_URL}?format=json${offset ? `&offset=${offset}` : ''}`;
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
		const categories = (post.categories ?? []).map(tag).filter((c) => c && !/^(all|active)$/i.test(c));
		const exited = categories.some((c) => /^(acquired|exited|ipo)$/i.test(c));
		const site = [...(post.body ?? '').matchAll(LINK)].map((m) => unescape(m[1])).find((u) => !NOISE.test(u));
		companies.push({
			name,
			category: [...categories, exited ? 'Exited' : ''].filter((t, i, all) => t && all.indexOf(t) === i).join(', '),
			url: site || (post.fullUrl ? `${BASE_URL}${post.fullUrl}` : PAGE_URL)
		});
	}

	if (companies.length === 0) {
		throw new Error('differential: no companies in the portfolio blog');
	}

	return companies;
}
