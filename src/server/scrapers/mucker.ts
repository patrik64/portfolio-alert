import type { ScrapedCompany } from './types';

const BASE_URL = 'https://mucker.com';
const PAGE_URL = `${BASE_URL}/our-companies/`;
const FEED_URL = `${BASE_URL}/feed/?post_type=company`;
const TERMS_URL = `${BASE_URL}/wp-json/wp/v2/search?type=term&per_page=100&subtype=`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress under elementor. the wall is a hundred and six logos and not one
// word: every image has an empty alt, most are uploaded as image-13.png or
// 5.png, and nothing links off the site. what each tile does carry is the
// fund's own page for the company and, in the classes elementor prints on it,
// the taxonomies the company is filed under.
//
// so the names are fetched rather than read. the company post type is not in
// the rest api, and a company's own page is half a megabyte, which is a
// hundred and six of those a night for a heading. but wordpress will serve any
// post type as a feed, ten at a time, so eleven small requests bring back all
// hundred and six titles as the fund writes them — AuditBoard, beatBread,
// BloomNation, and Atom for the company whose slug reads atom-2.
//
// the taxonomies are slugs on the tile rather than words, and the fund's words
// for them are in the search api: SaaS & B2B Marketplace for
// saas-b2b-marketplace, CyberSecurity for cybersecurity. a slug that has no
// term is left off rather than tidied into a word of our own, the way
// northpond's are. the third taxonomy is not about the company at all — its
// one term is called "Placement - Home Page" — so it is left alone.
//
// less than half the companies are filed under anything, which is the fund's
// own doing rather than a gap here.
//
// nothing on the page points at a company's own site, so each keeps the fund's
// page for it, which is where its tile points.

const TILE = /<div data-elementor-type="loop-item"[^>]*class="([^"]*)"([\s\S]*?)(?=<div data-elementor-type="loop-item"|$)/g;
const SLUG = /<a href="https:\/\/mucker\.com\/company\/([^"/]+)\/?"/;
const ITEM = /<item>([\s\S]*?)<\/item>/g;
const TITLE = /<title>([\s\S]*?)<\/title>/;
const LINK = /<link>([\s\S]*?)<\/link>/;
// the taxonomies that say something about the company
const KEPT = ['industry', 'region'];
// wordpress serves ten posts to a feed page and will not be asked for more
const FEED_PAGE = 10;
const MAX_PAGES = 40;

const clean = (s: string) =>
	s
		.replace(/<!\[CDATA\[|\]\]>/g, '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;|&#8220;|&#8221;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

const titled = (slug: string) =>
	slug.replace(/-/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase()).trim();

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const page = await fetchText(PAGE_URL);

	// the fund's own word for every term, keyed by the slug the tile carries
	const words = new Map<string, string>();
	for (const taxonomy of KEPT) {
		const found = JSON.parse(await fetchText(`${TERMS_URL}${taxonomy}`)) as {
			title?: string;
			url?: string;
		}[];
		for (const term of found) {
			const slug = (term.url ?? '').replace(/\/+$/, '').split('/').pop() ?? '';
			if (slug && term.title) words.set(`${taxonomy}-${slug}`, clean(term.title));
		}
	}

	// every company's title, ten to a page
	const names = new Map<string, string>();
	for (let page = 1; page <= MAX_PAGES; page++) {
		const feed = await fetchText(`${FEED_URL}&paged=${page}`);
		const entries = [...feed.matchAll(ITEM)];
		for (const [, entry] of entries) {
			const slug = clean(entry.match(LINK)?.[1] ?? '')
				.replace(/\/+$/, '')
				.split('/')
				.pop();
			const title = clean(entry.match(TITLE)?.[1] ?? '');
			if (slug && title) names.set(slug, title);
		}
		if (entries.length < FEED_PAGE) break;
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, classes, tile] of page.matchAll(TILE)) {
		const slug = tile.match(SLUG)?.[1];
		if (!slug) continue;

		// a company the feed does not carry keeps the fund's own word for it
		const name = names.get(slug) ?? titled(slug);
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({
			name,
			category: classes
				.split(/\s+/)
				.map((className) => words.get(className) ?? '')
				.filter(Boolean)
				.join(', '),
			url: `${BASE_URL}/company/${slug}/`
		});
	}

	if (companies.length === 0) {
		throw new Error('mucker: no companies on the wall');
	}

	return companies;
}
