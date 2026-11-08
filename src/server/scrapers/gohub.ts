import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://gohub.vc/founders/';
const API_URL = 'https://gohub.vc/wp-json/wp/v2';
const POSTS_URL = `${API_URL}/founder?per_page=100&_fields=id,title,link,vertical,country&page=`;
const TERMS_URL = (taxonomy: string) => `${API_URL}/${taxonomy}?per_page=100&_fields=id,name`;
const MAX_PAGES = 20;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress on elementor: the founders page is a grid of cards, one for each
// of the site's "founder" posts, each a logo with no alt text and a line
// about the company ("Shaping the Future of Preventive Care") linking the
// company's page on the fund's site, and, for one that is no longer held, a
// badge — "Exit" for a sale, "We tried" for one that did not make it. the
// names are not on the page, so they come from the site's rest api, which
// serves the same posts with their names and the terms the page's filters
// read: the vertical ("Digital Health") and the country, kept as tags. the
// badges are only on the page, so it is read too, and a card's post id ties
// the two; a sale is kept with the Exited tag and one that did not make it
// with the Closed tag. a card whose post the api leaves out is named after
// its page's address.

const CARD = /<article\b[^>]*\bclass="[^"]*\btype-founder\b[^"]*"[^>]*>[\s\S]*?<\/article>/g;
const POST_ID = /\bdata-dce-post-id="(\d+)"/;
const POST_LINK = /\bdata-post-link="([^"]+)"/;
const BADGE = /class="elementor-button-text">([^<]*)</;
const EXIT = /^exit(?:ed)?$/i;
const TRIED = /^we tried$/i;
const STEALTH = /^stealth\b/i;

interface Post {
	id?: number;
	title?: { rendered?: string };
	link?: string;
	vertical?: number[];
	country?: number[];
}

interface Term {
	id?: number;
	name?: string;
}

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// "https://gohub.vc/founder/agrow-analytics/" -> "Agrow Analytics"
const slugName = (link: string) =>
	(link.replace(/\/+$/, '').split('/').pop() ?? '')
		.split('-')
		.filter(Boolean)
		.map((w) => w[0].toUpperCase() + w.slice(1))
		.join(' ');

async function load<T>(url: string): Promise<{ body: T; pages: number }> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return { body: (await resp.json()) as T, pages: Number(resp.headers.get('x-wp-totalpages')) || 1 };
}

async function terms(taxonomy: string): Promise<Map<number, string>> {
	const names = new Map<number, string>();
	for (const { id, name } of (await load<Term[]>(TERMS_URL(taxonomy))).body) {
		if (typeof id === 'number' && name) names.set(id, tag(name));
	}
	return names;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const cards = [...(await resp.text()).matchAll(CARD)].map(([card]) => card);
	if (cards.length === 0) {
		throw new Error('gohub: no founder cards on the page — the markup moved');
	}

	const [verticals, countries] = await Promise.all([terms('vertical'), terms('country')]);
	const posts = new Map<number, Post>();
	for (let n = 1, pages = 1; n <= pages && n <= MAX_PAGES; n++) {
		const page = await load<Post[]>(POSTS_URL + n);
		for (const post of page.body) if (typeof post.id === 'number') posts.set(post.id, post);
		pages = page.pages;
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of cards) {
		const post = posts.get(Number(card.match(POST_ID)?.[1]));
		const link = unescape(post?.link ?? card.match(POST_LINK)?.[1] ?? '').trim();
		const name = clean(post?.title?.rendered ?? '') || slugName(link);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const badge = clean(card.match(BADGE)?.[1] ?? '');
		companies.push({
			name,
			category: [
				...(post?.vertical ?? []).map((id) => verticals.get(id) ?? ''),
				...(post?.country ?? []).map((id) => countries.get(id) ?? ''),
				EXIT.test(badge) ? 'Exited' : TRIED.test(badge) ? 'Closed' : ''
			]
				.filter((t, k, all) => t && all.indexOf(t) === k)
				.join(', '),
			url: link || PAGE_URL
		});
	}

	return companies;
}
