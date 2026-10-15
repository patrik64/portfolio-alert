import type { ScrapedCompany } from './types';

const BASE_URL = 'https://petracapital.com';
const PAGE_URL = `${BASE_URL}/portfolio/`;
// the page's own data, as wordpress serves it: the case-study post type and
// the two taxonomies its grid filters by
const API_URL = `${BASE_URL}/wp-json/wp/v2`;
const POSTS_URL = `${API_URL}/loco_mod_case_study?per_page=100&_fields=id,date,link,title,loco_mod_cs_cat_tax,loco_mod_cs_label_tax`;
const INDUSTRIES_URL = `${API_URL}/loco_mod_cs_cat_tax?per_page=100&_fields=id,name`;
const STATUSES_URL = `${API_URL}/loco_mod_cs_label_tax?per_page=100&_fields=id,slug`;
const MAX_PAGES = 40;
const REFUSED_MS = 20_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the portfolio page is a grid of logos, a logo a company named in
// a heading kept for screen readers and linking its page here, and classed
// for the page's filters by its industry ("Healthcare", "Technology Enabled
// Services") and its status ("Current", "Former"); a company's page adds the
// year the fund invested, which is the date the fund gave its post. the grid
// shows every published case study, so the post type is read from the site's
// api instead of the page and the sixty-odd company pages behind it — three
// requests for the posts, the industries and the statuses, where the host asks
// crawlers for ten seconds between requests. the industry and the year are
// kept as tags, a former holding with the Exited tag; the pages give no site,
// so every company links its page here. a list shorter than the total the api
// reports fails the run rather than pass for the whole.

const YEAR = /^((?:19|20)\d{2})/;
const FORMER = /^former$/i;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

interface Post {
	id?: number;
	date?: string;
	link?: string;
	title?: { rendered?: string };
	loco_mod_cs_cat_tax?: number[];
	loco_mod_cs_label_tax?: number[];
}

interface Term {
	id?: number;
	name?: string;
	slug?: string;
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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// a page, or a refusal waited out once
async function get(url: string): Promise<Response> {
	const headers = { 'User-Agent': UA, Accept: 'application/json' };
	const resp = await fetch(url, { headers });
	if (resp.status !== 429) return resp;
	await resp.body?.cancel();
	await wait(REFUSED_MS);
	return fetch(url, { headers });
}

// the api's answer, with the total it reports; a page where json was asked
// for means the request never reached the api
async function fetchJson<T>(url: string): Promise<{ rows: T[]; total: number; pages: number }> {
	const resp = await get(url);
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	const body = await resp.text();
	if (/^\s*</.test(body)) {
		throw new Error('petra: the api answered a page instead of json');
	}
	return {
		rows: JSON.parse(body) as T[],
		total: Number(resp.headers.get('x-wp-total') ?? 0),
		pages: Number(resp.headers.get('x-wp-totalpages') ?? 1)
	};
}

// every post of the type, a page at a time, checked against the total
async function allPosts(): Promise<Post[]> {
	const first = await fetchJson<Post>(POSTS_URL);
	const posts = [...first.rows];
	for (let page = 2; page <= Math.min(first.pages, MAX_PAGES); page++) {
		posts.push(...(await fetchJson<Post>(`${POSTS_URL}&page=${page}`)).rows);
	}
	if (posts.length < first.total) {
		throw new Error(`petra: the api gave ${posts.length} of the ${first.total} case studies it counts`);
	}
	return posts;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const [posts, industries, statuses] = await Promise.all([
		allPosts(),
		fetchJson<Term>(INDUSTRIES_URL),
		fetchJson<Term>(STATUSES_URL)
	]);
	const industryOf = new Map(industries.rows.map((t) => [t.id, tag(t.name ?? '')]));
	const statusOf = new Map(statuses.rows.map((t) => [t.id, clean(t.slug ?? '')]));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const post of posts) {
		const name = clean(post.title?.rendered ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const year = (post.date ?? '').match(YEAR)?.[1];
		const former = (post.loco_mod_cs_label_tax ?? []).some((id) => FORMER.test(statusOf.get(id) ?? ''));
		const link = clean(post.link ?? '');
		companies.push({
			name,
			category: [
				...(post.loco_mod_cs_cat_tax ?? []).map((id) => industryOf.get(id) ?? ''),
				year ? `Invested ${year}` : '',
				former ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(link) ? link : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('petra: the api lists no case studies — the post type moved');
	}

	return companies;
}
