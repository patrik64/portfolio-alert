import type { ScrapedCompany } from './types';

const BASE_URL = 'https://ffvc.com';
const PAGE_URL = `${BASE_URL}/portfolio/`;
const API = `${BASE_URL}/wp-json/wp/v2`;
const PER_PAGE = 100;
const MAX_PAGES = 20;
// the share of the rest api's count the listing must reach to be believed
const MIN_SHARE = 0.9;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress under elementor and jetengine. the portfolio page is a grid of
// logos jetengine draws ten at a time through its own ajax, each a logo
// linking the company's site and nothing else — no name, no alt text. the
// rest api's portfolio type names every company, keyed by the same post id
// the grid's items carry, and gives no site; so the api is read for the
// names and the grid, page after page, for the sites. the grid's requests
// need a signature and the listing's settings the page and its first answer
// carry, read fresh each run. the filters the page offers — a country, a
// practice area, the exits — are meta queries the grid does not repeat on
// its items and the api does not expose, so a company comes with nothing to
// file it under.

interface Post {
	id: number;
	title?: { rendered?: string };
	link?: string;
}

interface Answer {
	success?: boolean;
	data?: { html?: string };
}

const LAZY = /data-lazy-load="([^"]*)"/;
const WIDGET = /data-id="(\w+)"[^>]*data-element_type="widget"[^>]*id="gl-port"/;
const AJAX_URL = /"ajaxlisting":"([^"]+)"/;
const NAV = /data-nav="([^"]*)"/;
const ITEM = /(?=<div class="jet-listing-grid__item\b)/;
const POST_ID = /\bdata-post-id="(\d+)"/;
const SITE = /\bdata-url="(https?:\/\/[^"]+)"/;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

const attrJson = (attr: string) => JSON.parse(attr.replace(/&quot;/g, '"').replace(/&amp;/g, '&')) as Record<string, unknown>;

// a nested object as php's form fields: settings[a][b]=…
function flatten(body: URLSearchParams, prefix: string, value: unknown) {
	if (Array.isArray(value)) value.forEach((v, i) => flatten(body, `${prefix}[${i}]`, v));
	else if (value && typeof value === 'object')
		for (const [k, v] of Object.entries(value)) flatten(body, `${prefix}[${k}]`, v);
	else body.set(prefix, value == null ? '' : String(value));
}

async function fetchJson<T>(url: string): Promise<{ data: T; resp: Response }> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return { data: (await resp.json()) as T, resp };
}

async function ask(url: string, body: URLSearchParams): Promise<string> {
	const resp = await fetch(url, {
		method: 'POST',
		headers: {
			'User-Agent': UA,
			'Content-Type': 'application/x-www-form-urlencoded',
			'X-Requested-With': 'XMLHttpRequest'
		},
		body
	});
	if (!resp.ok) {
		throw new Error(`ffvc: the listing answered ${resp.status}`);
	}
	const answer = (await resp.json()) as Answer;
	if (!answer.success || typeof answer.data?.html !== 'string') {
		throw new Error('ffvc: the listing gave no companies');
	}
	return answer.data.html;
}

// every grid item's post id and site, page after page
async function sites(html: string): Promise<Map<number, string>> {
	const lazy = attrJson(html.match(LAZY)?.[1] ?? '{}');
	const widget = html.match(WIDGET)?.[1];
	const ajaxUrl = unescape(html.match(AJAX_URL)?.[1]?.replace(/\\\//g, '/') ?? '');
	if (!lazy.query || !widget || !ajaxUrl) {
		throw new Error('ffvc: the portfolio page no longer carries its listing settings');
	}
	const page = (settings: Record<string, unknown>) => {
		const body = new URLSearchParams();
		flatten(body, 'page_settings', {
			post_id: lazy.post_id,
			queried_id: lazy.queried_id,
			element_id: widget,
			...settings
		});
		body.set('listing_type', 'elementor');
		body.set('isEditMode', 'false');
		return body;
	};

	const found = new Map<number, string>();
	const read = (grid: string) => {
		let added = 0;
		for (const item of grid.split(ITEM).slice(1)) {
			const id = Number(item.match(POST_ID)?.[1]);
			if (!id || found.has(id)) continue;
			found.set(id, unescape(item.match(SITE)?.[1] ?? ''));
			added++;
		}
		return added;
	};

	const first = page({ page: 1, query: lazy.query });
	first.set('action', 'jet_engine_ajax');
	first.set('handler', 'get_listing');
	const grid = await ask(ajaxUrl, first);
	read(grid);
	const nav = attrJson(grid.match(NAV)?.[1] ?? '{}');
	for (let n = 2; n <= MAX_PAGES && nav.query; n++) {
		const more = page({ page: n, query: nav.query });
		more.set('action', 'jet_engine_ajax');
		more.set('handler', 'listing_load_more');
		flatten(more, 'widget_settings', nav.widget_settings);
		if (read(await ask(ajaxUrl, more)) === 0) break;
	}
	return found;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const posts: Post[] = [];
	let total = 0;
	for (let page = 1; page <= MAX_PAGES; page++) {
		const { data, resp } = await fetchJson<Post[]>(
			`${API}/portfolio?per_page=${PER_PAGE}&page=${page}&_fields=id,title,link`
		);
		total = Number(resp.headers.get('x-wp-total')) || total;
		posts.push(...data);
		if (page >= (Number(resp.headers.get('x-wp-totalpages')) || 1)) break;
	}
	if (total > 0 && posts.length < total) {
		throw new Error(`ffvc: read ${posts.length} of the ${total} companies listed`);
	}

	const siteOf = await sites(html);
	if (siteOf.size < posts.length * MIN_SHARE) {
		throw new Error(`ffvc: the listing showed ${siteOf.size} of the ${posts.length} companies the rest api lists`);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const post of posts) {
		const name = clean(post.title?.rendered ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: '', url: siteOf.get(post.id) || unescape(post.link ?? '') });
	}

	if (companies.length === 0) {
		throw new Error('ffvc: the rest api lists no companies');
	}

	return companies;
}
