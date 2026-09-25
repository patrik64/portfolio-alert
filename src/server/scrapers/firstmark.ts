import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.firstmark.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
const API = `${BASE_URL}/wp-json/wp/v2`;
const PER_PAGE = 100;
const MAX_PAGES = 20;
// cloudflare in front of the site answers a burst of page requests with 429s
// — ten at once tripped it, a hundred one after another did not — so the
// companies' pages are asked for one at a time, a pause between them, and a
// refusal is waited out once
const PACE_MS = 150;
const RETRY_DELAY_MS = 20_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress on bedrock, a theme of its own. the rest api's portfolio type
// holds every company with the fund's terms for it — the sectors it is filed
// under and its status, "Active - Early", "Active - Growth", "Exited -
// Acquired" or "Exited - IPO" — but no site; the portfolio page adds, on the
// card of a company the fund is out of, how it went ("Acquired by Adobe",
// "NASDAQ: ABNB"), and each company's own page on the fund's site gives its
// website under that heading. so the api is read for the list, the page for
// the notes and the companies' pages, one by one, for the sites; a page that
// will not load leaves its company linking to that page. the notes are kept
// as the fund writes them, a typo or a capital included.

interface Post {
	slug?: string;
	link?: string;
	title?: { rendered?: string };
	portfolio_categories?: number[];
	status_categories?: number[];
}

interface Term {
	id: number;
	name?: string;
	slug?: string;
}

const ITEM = /(?=<li\b[^>]*\bdata-list-item\b)/;
const ITEM_PAGE = /href="https?:\/\/(?:www\.)?firstmark\.com\/portfolio\/([^/"?#]+)\/?"/;
const NOTE = /<p class="origin-top-left f-ui-2\b[^"]*">([\s\S]*?)<\/p>/;
const WEBSITE = /<span class="f-ui-1">\s*Website\s*<\/span>[\s\S]*?<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
const STEALTH = /^stealth\b/i;

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

// "ACQUIRED BY SALESFORCE" -> "Acquired by SALESFORCE", "Acquired by Learning
// Pool." -> "Acquired by Learning Pool"
const note = (s: string) =>
	tag(s)
		.replace(/^acquired by\b/i, 'Acquired by')
		.replace(/\.$/, '');

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

async function fetchJson<T>(url: string): Promise<{ data: T; resp: Response }> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return { data: (await resp.json()) as T, resp };
}

async function terms(taxonomy: string): Promise<Map<number, Term>> {
	const { data } = await fetchJson<Term[]>(`${API}/${taxonomy}?per_page=100&_fields=id,name,slug`);
	return new Map(data.map((term) => [term.id, term]));
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// the site a company's page gives, or nothing when the page will not load
async function siteOf(page: string): Promise<string> {
	try {
		let resp = await fetch(page, { headers: { 'User-Agent': UA } });
		if (resp.status === 429) {
			await wait(RETRY_DELAY_MS);
			resp = await fetch(page, { headers: { 'User-Agent': UA } });
		}
		if (!resp.ok) return '';
		return unescape((await resp.text()).match(WEBSITE)?.[1] ?? '');
	} catch {
		return '';
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const [sectors, statuses, html] = await Promise.all([
		terms('portfolio_categories'),
		terms('status_categories'),
		fetchText(PAGE_URL)
	]);

	// the exit notes, by the company page each card links
	const notes = new Map<string, string>();
	for (const item of html.split(ITEM).slice(1)) {
		const card = item.split('</li>')[0];
		const slug = card.match(ITEM_PAGE)?.[1];
		const text = note(card.match(NOTE)?.[1] ?? '');
		if (slug && text) notes.set(slug, text);
	}

	const posts: Post[] = [];
	let total = 0;
	for (let page = 1; page <= MAX_PAGES; page++) {
		const { data, resp } = await fetchJson<Post[]>(
			`${API}/portfolio?per_page=${PER_PAGE}&page=${page}&_fields=slug,link,title,portfolio_categories,status_categories`
		);
		total = Number(resp.headers.get('x-wp-total')) || total;
		posts.push(...data);
		if (page >= (Number(resp.headers.get('x-wp-totalpages')) || 1)) break;
	}
	if (total > 0 && posts.length < total) {
		throw new Error(`firstmark: read ${posts.length} of the ${total} companies listed`);
	}

	const listed: { name: string; page: string; slug: string; sectors: string[]; status: Term | undefined }[] = [];
	const seen = new Set<string>();
	for (const post of posts) {
		const name = clean(post.title?.rendered ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		listed.push({
			name,
			page: unescape(post.link ?? ''),
			slug: post.slug ?? '',
			sectors: (post.portfolio_categories ?? []).map((id) => tag(sectors.get(id)?.name ?? '')),
			status: (post.status_categories ?? []).map((id) => statuses.get(id)).find(Boolean)
		});
	}

	const companies: ScrapedCompany[] = [];
	for (const [i, c] of listed.entries()) {
		if (i > 0) await wait(PACE_MS);
		const site = c.page ? await siteOf(c.page) : '';
		const status = clean(c.status?.name ?? '');
		const exited = /^exited\b/i.test(c.status?.slug ?? '') || /^exited\b/i.test(status);
		// "Active - Early" -> "Early"; an exit's status gives way to the
		// page's note of how it went, or stands in ("Acquired") without one
		const stage = status.split(/\s+-\s+/).pop() ?? '';
		companies.push({
			name: c.name,
			category: [...c.sectors, exited ? notes.get(c.slug) || stage : stage, exited ? 'Exited' : '']
				.filter((t, k, all) => t && all.indexOf(t) === k)
				.join(', '),
			url: site || c.page
		});
	}

	if (companies.length === 0) {
		throw new Error('firstmark: the rest api lists no companies');
	}

	return companies;
}
