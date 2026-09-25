import type { ScrapedCompany } from './types';

const BASE_URL = 'https://ecpgrowth.com';
const PAGE_URL = `${BASE_URL}/portfolio/`;
const API_URL = `${BASE_URL}/wp-json/wp/v2`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, a theme of its own: the portfolio is a post type the rest api
// lists whole, a post per company carrying its page — a paragraph about
// it, its headquarters and, under "WEBSITE", a link to its site — and
// filed under categories: the consumer themes the fund invests behind
// ("Accessible Nutrition"), "Industry" on every one, and "Exits" on one the
// fund is out of. the pages of the listing are followed to the last. a
// site link pasted with an advert's tracking is cut back to the address.

const WEBSITE = /WEBSITE<\/h\d>[\s\S]*?<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
const HEADQUARTERS = /HEADQUARTERS<\/h\d>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/;
const TRACKING = /(?:^|[?&])(?:utm_\w+|gclid|fbclid|campaign|adgroupid|g_\w+)=/i;
const STEALTH = /^stealth\b/i;

interface Term {
	id: number;
	name: string;
}

interface Post {
	title?: { rendered?: string };
	link?: string;
	categories?: number[];
	content?: { rendered?: string };
}

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a place written "Santa Monica, CA" would
// read as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// an address without the advert's tracking pasted after it
function untracked(url: string): string {
	try {
		const parsed = new URL(url);
		if (TRACKING.test(parsed.search)) {
			parsed.search = '';
			parsed.hash = '';
		}
		return parsed.href;
	} catch {
		return url;
	}
}

async function fetchJson<T>(url: string): Promise<{ data: T; pages: number }> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return { data: (await resp.json()) as T, pages: Number(resp.headers.get('x-wp-totalpages') ?? '1') || 1 };
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const terms = (await fetchJson<Term[]>(`${API_URL}/categories?per_page=100&_fields=id,name`)).data;
	const names = new Map(terms.map((term) => [term.id, clean(term.name)]));

	const posts: Post[] = [];
	for (let page = 1, pages = 1; page <= pages && page <= 20; page++) {
		const listing = await fetchJson<Post[]>(
			`${API_URL}/portfolio?per_page=100&page=${page}&_fields=title,link,categories,content`
		);
		posts.push(...listing.data);
		pages = listing.pages;
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const post of posts) {
		const name = clean(post.title?.rendered ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const categories = (post.categories ?? []).map((id) => names.get(id) ?? '').filter(Boolean);
		const exited = categories.some((c) => /^exits?$/i.test(c));
		const content = post.content?.rendered ?? '';
		companies.push({
			name,
			category: [
				...categories.filter((c) => !/^(exits?|industry)$/i.test(c)).map(tag),
				tag(content.match(HEADQUARTERS)?.[1] ?? ''),
				exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: untracked(unescape(content.match(WEBSITE)?.[1] ?? '')) || post.link || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('ecp: no companies in the portfolio listing');
	}

	return companies;
}
