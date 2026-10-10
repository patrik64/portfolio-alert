import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.verve.vc';
const PAGE_URL = `${BASE_URL}/portfolio-overview/`;
const API_URL = `${BASE_URL}/wp-json/wp/v2`;
// the pages of the overview, and the company pages, are asked for one at a
// time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const MAX_PAGES = 30;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, the uncode theme: the portfolio overview shows eighteen
// companies at a time, its "Load more" button fetching the next eighteen
// ("?upage=2") up to the last page it names. a company's tile shows a line
// about it and its status but not its name, so the tiles, which decide who
// is listed, are matched by their post's id to the site's own api, which
// gives each company's name, its status ("Holding", "Exit"), its industry
// ("Digital", "Health & Bio") and its investment topic ("Future of
// Computing & AI"). a company's own page adds the country it is in, the
// year the fund invested and a link to its site. the industry, the topic,
// the country and the year are kept as tags, an exit with the Exited tag.
// a page of the overview that will not load, or a tile the api does not
// know, fails the run, as the list would be short; a company page that
// will not load leaves its company linking it.

const TILE = /<div class="tmb [^"]*\btmb-id-(\d+)\b/g;
const PAGES = /\bdata-page="\d+"\s+data-pages="(\d+)"/;
const FIELD = /<span class="sw-acf-field-label[^"]*">([^<]*)<\/span>\s*([^<]*)</g;
const LINK = /class="type-url\b[^"]*"\s*>\s*<a\s+href="([^"]*)"\s*>([^<]*)<\/a>/g;
const SOCIAL =
	/^(?:[\w-]+\.)*(?:verve\.vc|linkedin\.com|x\.com|twitter\.com|facebook\.com|instagram\.com|youtube\.com|youtu\.be)$/i;
const EXIT = /^exit(?:ed)?$/i;
const UNSAID = /^(?:-|other|others|all|n\/a|holding|pre-close)$/i;
const STEALTH = /^stealth\b/i;

interface Post {
	id?: number;
	link?: string;
	title?: { rendered?: string };
	'portfolio-status'?: number[];
	'portfolio-industry'?: number[];
	'investment-topic'?: number[];
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

const year = (s: string | undefined) => s?.match(/\b(?:19|20)\d{2}\b/)?.[0];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// a page, or a refusal waited out once
async function get(url: string, accept = 'text/html'): Promise<Response> {
	const headers = { 'User-Agent': UA, Accept: accept };
	const resp = await fetch(url, { headers });
	if (resp.status !== 429) return resp;
	await resp.body?.cancel();
	await wait(REFUSED_MS);
	return fetch(url, { headers });
}

// every item of an api collection, a hundred at a time
async function all<T>(path: string): Promise<T[]> {
	const items: T[] = [];
	for (let page = 1, pages = 1; page <= pages && page <= MAX_PAGES; page++) {
		const resp = await get(`${API_URL}/${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`, 'application/json');
		if (!resp.ok) {
			throw new Error(`verve: the site's api answered ${resp.status} for ${path.split('?')[0]}`);
		}
		pages = Number(resp.headers.get('x-wp-totalpages')) || 1;
		items.push(...((await resp.json()) as T[]));
	}
	return items;
}

// "https://metafuels.ch" -> the host, to tell a company's site from the rest
function hostOf(href: string): string {
	try {
		return new URL(href).hostname;
	} catch {
		return '';
	}
}

interface Page {
	site: string;
	country: string;
	invested?: string;
}

// what a company's page says, or nothing when it will not load
async function pageOf(href: string): Promise<Page | null> {
	try {
		const resp = await get(href);
		if (!resp.ok) {
			await resp.body?.cancel();
			return null;
		}
		const html = await resp.text();
		const fields = new Map<string, string>(
			[...html.matchAll(FIELD)].map(([, label, value]) => [clean(label).toLowerCase(), clean(value)])
		);
		const links = [...html.matchAll(LINK)].map(([, link, label]) => ({ link: unescape(link).trim(), label: clean(label) }));
		const usable = (link: string) => /^https?:\/\//i.test(link) && !!hostOf(link) && !SOCIAL.test(hostOf(link));
		const site =
			links.find(({ link, label }) => /^website$/i.test(label) && usable(link))?.link ??
			links.find(({ link }) => usable(link))?.link ??
			'';
		return { site, country: fields.get('located in') ?? '', invested: year(fields.get('invested since')) };
	} catch {
		return null;
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	// the tiles the overview shows, page by page
	const tiles: number[] = [];
	for (let page = 1, pages = 1; page <= pages && page <= MAX_PAGES; page++) {
		if (page > 1) await wait(PACE_MS);
		const resp = await get(page === 1 ? PAGE_URL : `${PAGE_URL}?upage=${page}`);
		if (!resp.ok) {
			throw new Error(`verve: page ${page} of the portfolio overview would not load (${resp.status})`);
		}
		const html = await resp.text();
		const found = [...html.matchAll(TILE)].map(([, id]) => Number(id));
		if (found.length === 0) {
			throw new Error(`verve: no companies on page ${page} of the portfolio overview — the markup moved`);
		}
		tiles.push(...found);
		if (page === 1) pages = Number(html.match(PAGES)?.[1]) || 1;
	}

	const [posts, statuses, industries, topics] = await Promise.all([
		all<Post>('verve_portfolio_new?_fields=id,link,title,portfolio-status,portfolio-industry,investment-topic'),
		all<Term>('portfolio-status?_fields=id,name'),
		all<Term>('portfolio-industry?_fields=id,name'),
		all<Term>('investment-topic?_fields=id,name')
	]);
	const byId = new Map(posts.map((p) => [p.id, p]));
	const names = (terms: Term[]) => new Map(terms.map((t) => [t.id, clean(t.name ?? '')]));
	const [status, industry, topic] = [names(statuses), names(industries), names(topics)];

	// a part of the list must not pass for the whole
	const missing = [...new Set(tiles)].filter((id) => !byId.has(id));
	if (missing.length > 0) {
		throw new Error(`verve: ${missing.length} of the overview's companies are not in the site's api`);
	}

	const listed: Post[] = [];
	const seen = new Set<string>();
	for (const id of tiles) {
		const post = byId.get(id)!;
		const name = clean(post.title?.rendered ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		listed.push(post);
	}

	const companies: ScrapedCompany[] = [];
	let withSite = 0;
	for (const [i, post] of listed.entries()) {
		if (i > 0) await wait(PACE_MS);
		const profile = unescape(post.link ?? '').trim();
		const page = profile.startsWith(`${BASE_URL}/`) ? await pageOf(profile) : null;
		if (page?.site) withSite++;
		const states = (post['portfolio-status'] ?? []).map((id) => status.get(id) ?? '');
		companies.push({
			name: clean(post.title?.rendered ?? ''),
			category: [
				...(post['portfolio-industry'] ?? []).map((id) => tag(industry.get(id) ?? '')),
				...(post['investment-topic'] ?? []).map((id) => tag(topic.get(id) ?? '')),
				tag(page?.country ?? ''),
				page?.invested ? `Invested ${page.invested}` : '',
				states.some((s) => EXIT.test(s)) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: page?.site || profile || PAGE_URL
		});
	}
	// without the company pages every company would link the fund's site
	if (withSite === 0) {
		throw new Error("verve: no company page gave its site — the pages' markup moved");
	}

	return companies;
}
