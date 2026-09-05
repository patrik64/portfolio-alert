import type { ScrapedCompany } from './types';

const BASE_URL = 'https://massmutualventures.com';
const PAGE_URL = `${BASE_URL}/portfolio/`;
const POSTS_URL = `${BASE_URL}/wp-json/wp/v2/avada_portfolio?per_page=100&_fields=id,title,content`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress on avada. the wall names each company in an attribute and files it
// under classes, and the fund's own filter says what those classes mean, so
// the words come from the page rather than from tidying a slug.
//
// only some of the classes are named there. the rest say which of the fund's
// funds holds a company — us-israel, asia-pacific — which is the fund's own
// structure rather than anything about the company, and is left off on both
// counts.
//
// nineteen tiles carry a line saying who bought the company, and that is kept
// as the fund writes it: Acquired by Valsoft, Acquired by JLL (NYSE: JLL).
//
// the wall gives no addresses, but each tile carries its post id and the posts
// are in the api. a post puts the company's linkedin and its own site in the
// same list, the first as an icon and the second written out, so the written
// one is the company's. three of the sixty-eight have neither.

const TILE = /<li id="eg-\d+-post-id-\d+_\d+"[^>]*class="([^"]*)"[^>]*data-title="[^"]*"([\s\S]*?)<\/li>/g;
const NAME = /data-posttitle="([^"]*)"/;
const POST = /data-post="(\d+)"/;
const NOTE = /class="esg-content[^"]*">([\s\S]*?)<\/div>/;
const FILTER = /data-filter="(filter-[^"]*)"[^>]*>([\s\S]{0,120}?)<\//g;
const ICONS = /<ul class="port-icon-inline">([\s\S]*?)<\/ul>/;
const LINK = /<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;

interface Post {
	id?: number;
	content?: { rendered?: string };
}

const clean = (s: string) =>
	s
		.replace(/<[^>]+>/g, ' ')
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;|&#8220;|&#8221;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const [html, posts] = await Promise.all([
		fetchText(PAGE_URL),
		fetchText(POSTS_URL).then((body) => JSON.parse(body) as Post[])
	]);

	// the fund's own word for each class it filters by
	const words = new Map<string, string>();
	for (const [, slug, said] of html.matchAll(FILTER)) {
		const word = clean(said);
		if (word) words.set(slug, word);
	}

	// each company's own address, written out beside its linkedin icon
	const addresses = new Map<number, string>();
	for (const post of posts) {
		const icons = (post.content?.rendered ?? '').match(ICONS)?.[1] ?? '';
		const written = [...icons.matchAll(LINK)].find((link) => clean(link[2]));
		if (post.id && written) addresses.set(post.id, written[1]);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, classes, tile] of html.matchAll(TILE)) {
		const name = clean(tile.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({
			name,
			category: [
				...classes
					.split(/\s+/)
					.map((label) => words.get(label) ?? '')
					.filter(Boolean),
				clean(tile.match(NOTE)?.[1] ?? '')
			]
				.filter(Boolean)
				.join(', '),
			url: addresses.get(Number(tile.match(POST)?.[1] ?? 0)) ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('massmutual: no companies on the portfolio wall');
	}

	return companies;
}
