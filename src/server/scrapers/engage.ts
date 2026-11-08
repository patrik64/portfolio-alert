import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://engage.vc/portfolio/';
const API_URL = 'https://engage.vc/wp-json/wp/v2';
// the portfolio's posts, a hundred a page, each with its name, its link and
// the ids of the terms it is filed under
const POSTS_URL = `${API_URL}/portfolio?per_page=100&_fields=title,link,portfolio-category&page=`;
const TERMS_URL = `${API_URL}/portfolio-category?per_page=100&_fields=id,name`;
const MAX_PAGES = 20;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress on divi: the portfolio page is a wall of cards, each a white
// logo with no alt text, a line about the company and its city, linking the
// company's site, so the names are not on the page. the wall is drawn from
// the site's portfolio posts, which its rest api serves whole — a company
// each with its name, its link (the company's site, or its page on the
// fund's site for the two with none) and the terms the wall's filter reads:
// the sectors ("Future of Work", "Data & Analytics"), kept as tags, and
// "Exited", kept as the Exited tag. the filter also has a term for each of
// the fund's two vehicles, "Early Stage Fund" and "Engage", which hold a
// company apiece; the one named after the fund names nothing and is left
// out. an old name in brackets ("FeatureBase (formerly Molecula)") is not
// kept. every page of the api must load, and a list shorter than the total
// it reports fails the run.

const EXITED = /^exited$/i;
const FUND = /^engage$/i;
// "(formerly Molecula)", "(fka Civic Eagle)"
const OLD_NAME = /\s*\((?:formerly|f\.?k\.?a\.?|prev(?:iously)?\.?)\s[^)]*\)\s*$/i;
const STEALTH = /^stealth\b/i;

interface Post {
	title?: { rendered?: string };
	link?: string;
	'portfolio-category'?: number[];
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

async function load<T>(url: string): Promise<{ body: T; total: number; pages: number }> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return {
		body: (await resp.json()) as T,
		total: Number(resp.headers.get('x-wp-total')) || 0,
		pages: Number(resp.headers.get('x-wp-totalpages')) || 1
	};
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const terms = new Map<number, string>();
	for (const { id, name } of (await load<Term[]>(TERMS_URL)).body) {
		if (typeof id === 'number' && name) terms.set(id, clean(name));
	}

	const posts: Post[] = [];
	let total = 0;
	for (let n = 1, pages = 1; n <= pages && n <= MAX_PAGES; n++) {
		const page = await load<Post[]>(POSTS_URL + n);
		posts.push(...page.body);
		total = page.total;
		pages = page.pages;
	}
	if (total && posts.length < total) {
		throw new Error(`engage: the api reported ${total} companies and gave ${posts.length}`);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const post of posts) {
		const name = clean(post.title?.rendered ?? '').replace(OLD_NAME, '').trim();
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const filed = (post['portfolio-category'] ?? []).map((id) => terms.get(id) ?? '').filter(Boolean);
		companies.push({
			name,
			category: [
				...filed.filter((t) => !EXITED.test(t) && !FUND.test(t)).map(tag),
				filed.some((t) => EXITED.test(t)) ? 'Exited' : ''
			]
				.filter((t, k, all) => t && all.indexOf(t) === k)
				.join(', '),
			url: unescape(post.link ?? '').trim() || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('engage: no portfolio posts in the api');
	}

	return companies;
}
