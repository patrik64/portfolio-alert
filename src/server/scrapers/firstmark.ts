import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.firstmark.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
const API = `${BASE_URL}/wp-json/wp/v2`;
const BOARD_URL = 'https://jobs.firstmark.com/companies';
const GETRO_API = 'https://api.getro.com/api/v2';
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
//
// on 2026-10-29 cloudflare put its bot challenge in front of the whole site,
// robots.txt and the rest api included, for a laptop as for the deployment.
// while it stands the fund's jobs board is read instead, which getro runs on a
// host of its own: a page naming the board's network, then getro's search, a
// dozen companies at a time. the board is the fund's list but not its whole
// portfolio — about ninety of the hundred and fifty, and a company shows only
// once the fund adds it — so the site is asked first every run and read again
// as soon as it answers. the board does not say which the fund has exited, and
// spells some names its own way; those are read as stored from the site.

// companies stored from the site under the names it gave them
const STORED_AS: Record<string, string> = {
	'aspect build': 'Aspect',
	// the company behind ada, at the same address
	'friends electric': 'Ada',
	'goodday software': 'GoodDay',
	'h company': 'H',
	'henry ai': 'Henry',
	// getro took the name and the address from an older company's
	'highbeam research': 'Highbeam',
	'kasa living': 'Kasa',
	'loop returns': 'Loop',
	'parametrix insurance': 'Parametrix',
	'payy.link': 'Payy',
	'unlimited funds': 'Unlimited'
};

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

interface BoardCompany {
	name?: string;
	domain?: string;
	stage?: string;
	visible_industry_tags?: string[];
}

const NEXT_DATA = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;
const STAGES: Record<string, string> = {
	pre_seed: 'Pre-seed',
	seed: 'Seed',
	private_equity: 'Private Equity',
	acquisition: 'Acquired',
	ipo: 'IPO'
};
const UNSAID = /^(?:other|series_unknown|undisclosed|unknown)$/i;
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

// "https://www.firstmark.com/" -> "firstmark.com"
const bare = (domain: string) =>
	domain
		.trim()
		.toLowerCase()
		.replace(/^https?:\/\//, '')
		.replace(/^www\./, '')
		.replace(/[/?#].*$/, '');

// "series_b" -> "Series B"
const stageOf = (stage: string) =>
	UNSAID.test(stage)
		? ''
		: (STAGES[stage] ?? stage.replace(/^series_([a-z])$/, (_, letter: string) => `Series ${letter.toUpperCase()}`));

function failure(url: string, resp: Response): Error {
	if (resp.headers.get('cf-mitigated') === 'challenge') {
		return new Error(`firstmark: ${url} answered ${resp.status} with cloudflare's bot challenge`);
	}
	return new Error(`Failed to fetch ${url}: ${resp.status}`);
}

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw failure(url, resp);
	}
	return resp.text();
}

async function fetchJson<T>(url: string): Promise<{ data: T; resp: Response }> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw failure(url, resp);
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

async function readBoard(): Promise<ScrapedCompany[]> {
	const data = (await fetchText(BOARD_URL)).match(NEXT_DATA)?.[1];
	const network = data ? (JSON.parse(data)?.props?.pageProps?.network as { id?: string | number } | undefined) : undefined;
	if (!network?.id) {
		throw new Error("firstmark: the jobs board names no network — getro's page moved");
	}

	const found: BoardCompany[] = [];
	let count = Infinity;
	for (let page = 0; page < MAX_PAGES && found.length < count; page++) {
		if (page > 0) await wait(PACE_MS);
		const answer = await fetch(`${GETRO_API}/collections/${network.id}/search/companies`, {
			method: 'POST',
			headers: { 'User-Agent': UA, 'Content-Type': 'application/json', Accept: 'application/json' },
			body: JSON.stringify({ hitsPerPage: 12, page, query: '', filters: '' })
		});
		if (!answer.ok) {
			throw new Error(`firstmark: getro's company search answered ${answer.status} on page ${page}`);
		}
		const { results } = (await answer.json()) as { results?: { companies?: BoardCompany[]; count?: number } };
		const companies = results?.companies ?? [];
		count = results?.count ?? 0;
		if (companies.length === 0) break;
		found.push(...companies);
	}
	// a part of the list must not pass for the whole
	if (found.length === 0 || found.length < count) {
		throw new Error(`firstmark: getro's search gave ${found.length} of the ${count} companies it counts`);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const company of found) {
		const shown = clean(company.name ?? '');
		const name = STORED_AS[shown.toLowerCase()] ?? shown;
		const domain = bare(company.domain ?? '');
		// the board may list the fund too, for its own openings
		if (!name || STEALTH.test(name) || domain === 'firstmark.com' || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			category: [...(company.visible_industry_tags ?? []).map(tag), stageOf(clean(company.stage ?? ''))]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: domain ? `https://${domain}` : BOARD_URL
		});
	}

	return companies;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (resp.headers.get('cf-mitigated') === 'challenge') {
		return readBoard();
	}
	if (!resp.ok) {
		throw failure(PAGE_URL, resp);
	}
	const html = await resp.text();
	const [sectors, statuses] = await Promise.all([terms('portfolio_categories'), terms('status_categories')]);

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
