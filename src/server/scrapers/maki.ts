import type { ScrapedCompany } from './types';

const BASE_URL = 'https://maki.vc';
const PAGE_URL = `${BASE_URL}/portfolio/`;
const API_URL = `${BASE_URL}/wp-json/wp/v2`;
// the pages of the list are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const MAX_PAGES = 30;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, wp grid builder: the portfolio shows the fund's pinned
// companies until "Show all" is chosen ("?show=all"), and then every
// company, nine at a time ("&_page=2"). a company's card shows its logo, a
// line about it, its stage ("Series A+"), its industry ("Quantum") and the
// year the fund invested, but not its name, so the cards, which decide who
// is listed, are matched by their post's id to the site's own api, which
// gives each company's name, industry, stage and status, "Active" or
// "Exited". the industry, the stage and the year are kept as tags, an exit
// with the Exited tag. a company's page here links no site of its own, so
// every company links its page. a page of the list that will not load, or
// a card the api does not know, fails the run, as the list would be short.

const CARD = /(?=<article id="post-\d+")/;
const ID = /^<article id="post-(\d+)"/;
const YEAR = /class="case-card__year\b[^"]*">\s*((?:19|20)\d{2})\s*</;
const EXIT = /^exit(?:ed)?$/i;
const UNSAID = /^(?:-|other|others|all|n\/a|active)$/i;
const STEALTH = /^stealth\b/i;

interface Post {
	id?: number;
	link?: string;
	title?: { rendered?: string };
	case_industry?: number[];
	case_stage?: number[];
	case_status?: number[];
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
			throw new Error(`maki: the site's api answered ${resp.status} for ${path.split('?')[0]}`);
		}
		pages = Number(resp.headers.get('x-wp-totalpages')) || 1;
		items.push(...((await resp.json()) as T[]));
	}
	return items;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	// the cards "Show all" lists, page by page, until a page adds none
	const cards: number[] = [];
	const invested = new Map<number, string>();
	for (let page = 1; page <= MAX_PAGES; page++) {
		if (page > 1) await wait(PACE_MS);
		const resp = await get(`${PAGE_URL}?show=all&_page=${page}`);
		if (!resp.ok) {
			throw new Error(`maki: page ${page} of the portfolio would not load (${resp.status})`);
		}
		const html = await resp.text();
		let added = 0;
		for (const card of html.split(CARD).slice(1)) {
			const id = Number(card.match(ID)?.[1]);
			if (!id || invested.has(id)) continue;
			added++;
			cards.push(id);
			invested.set(id, card.match(YEAR)?.[1] ?? '');
		}
		if (added === 0) {
			if (page === 1) throw new Error('maki: no companies on the portfolio page — the markup moved');
			break;
		}
		// a list still going at the last page asked for would be cut short
		if (page === MAX_PAGES) {
			throw new Error(`maki: the portfolio still had companies after ${MAX_PAGES} pages`);
		}
	}

	const [posts, industries, stages, statuses] = await Promise.all([
		all<Post>('case?_fields=id,link,title,case_industry,case_stage,case_status'),
		all<Term>('case_industry?_fields=id,name'),
		all<Term>('case_stage?_fields=id,name'),
		all<Term>('case_status?_fields=id,name')
	]);
	const byId = new Map(posts.map((p) => [p.id, p]));
	const names = (terms: Term[]) => new Map(terms.map((t) => [t.id, clean(t.name ?? '')]));
	const [industry, stage, status] = [names(industries), names(stages), names(statuses)];

	// a part of the list must not pass for the whole
	const missing = cards.filter((id) => !byId.has(id));
	if (missing.length > 0) {
		throw new Error(`maki: ${missing.length} of the portfolio's companies are not in the site's api`);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const id of cards) {
		const post = byId.get(id)!;
		const name = clean(post.title?.rendered ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const states = (post.case_status ?? []).map((term) => status.get(term) ?? '');
		const year = invested.get(id);
		const profile = unescape(post.link ?? '').trim();
		companies.push({
			name,
			category: [
				...(post.case_industry ?? []).map((term) => tag(industry.get(term) ?? '')),
				...(post.case_stage ?? []).map((term) => tag(stage.get(term) ?? '')),
				year ? `Invested ${year}` : '',
				states.some((s) => EXIT.test(s)) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: profile.startsWith(`${BASE_URL}/`) ? profile : PAGE_URL
		});
	}

	return companies;
}
