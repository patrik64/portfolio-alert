import type { ScrapedCompany } from './types';

const BASE_URL = 'https://thecreatorfund.com';
const PAGE_URL = `${BASE_URL}/our-investments/`;
const API_URL = `${BASE_URL}/wp-json/wp/v2/case_study?per_page=100&_fields=title,link,excerpt`;
const AJAX_URL = `${BASE_URL}/wp-admin/admin-ajax.php`;
// cloudflare in front of the site lets an address ask forty times in a
// minute and answers the forty-first with a challenge under a 429, until the
// minute is out — and a run here asks some seventy-five times. so requests
// start no closer together than this, thirty-five to the minute, which makes
// a run two minutes long; and a refusal is waited out once, the whole minute
const PACE_MS = 1_700;
const REFUSED_MS = 65_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, a theme of its own: the investments page shows eight companies
// and loads the rest through admin-ajax, but the rest api lists every one
// as a post — the name, a description, and its page on the fund's site.
// that page states the universities the company came out of, a stage,
// "Active" or "Exited", a sector and the year invested, and links the site;
// those pages are fetched for that, and one that will not load leaves its
// company linking to that page. the country is told nowhere but by the
// investments page's filter, so each country there is asked of admin-ajax,
// on the nonce the page hands its script, for the companies filed under it;
// should that door be shut, the companies go without a country. an exit's
// description closes on how it went, "Loci was acquired by Epic Games in
// 2025". "Other" is the sector that says nothing.

const NONCE = /"nonce":"([^"]+)"/;
// a country of the filter: its term, and its name after the box drawn for it
const COUNTRY = /<input\b[^>]*\bname="country"[^>]*\bvalue="(\d+)"[^>]*>([\s\S]*?)<\/label>/g;
const CARD = /<a\b[^>]*\bhref="([^"]*\/case-studies\/[^"]+)"/g;
// "Sector:" and, in the column beside it, its values as buttons
const FACT = /<p\b[^>]*\buppercase\b[^>]*>([^<]*?):\s*<\/p>[\s\S]{0,400}?<div class="flex flex-wrap[^"]*">([\s\S]*?)<\/div>/g;
const VALUE = /<(a|p)\b[^>]*\bclass="button\b[^"]*"[^>]*>([\s\S]*?)<\/\1>/g;
const SITE = /<a\b[^>]*\bhref="([^"]+)"[^>]*>\s*Website\b/;
const ACQUIRED = /\bacquired by\s+([^.,;]+?)(?=\s+in\s+(?:19|20)\d{2}\b|\s*[.,;]|\s*$)/i;
const OTHER = /^other$/i;
const EXITS = /^(exit|acquired|ipo|merged)/i;
const STEALTH = /^stealth\b/i;

interface Post {
	title?: { rendered?: string };
	excerpt?: { rendered?: string };
	link?: string;
}

interface Answer {
	html?: string;
	foundPosts?: number | string;
}

interface Detail {
	sectors: string[];
	universities: string[];
	stage: string;
	year: string;
	site: string;
}

type Get = (url: string, headers?: Record<string, string>) => Promise<Response>;

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

// a company's page by its address, as the rest api and the listings write it
const key = (link: string) => unescape(link).trim().replace(/\/+$/, '');

// admin-ajax answers json whose markup is itself a json string
const markup = (html: string) => {
	try {
		const parsed: unknown = JSON.parse(html);
		return typeof parsed === 'string' ? parsed : html;
	} catch {
		return html;
	}
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// fetch kept to the pace, for the length of one run; the first refusal is
// waited out and asked again, and any after it is handed back as it came
function paced(): Get {
	let last = 0;
	let refused = false;
	return async (url, headers = {}) => {
		for (;;) {
			const early = last + PACE_MS - Date.now();
			if (early > 0) await wait(early);
			last = Date.now();
			const resp = await fetch(url, { headers: { 'User-Agent': UA, ...headers } });
			if (resp.status !== 429 || refused) return resp;
			refused = true;
			await resp.body?.cancel();
			await wait(REFUSED_MS);
		}
	};
}

// the companies' pages filed under one country of the filter, asked of
// admin-ajax the way the page's script asks, until the listing runs out
async function filedUnder(get: Get, nonce: string, term: string): Promise<string[]> {
	const pages: string[] = [];
	for (let asked = 0; asked < 10; asked++) {
		const query = new URLSearchParams({
			action: 'load_more_posts',
			nonce,
			postsPerPage: '100',
			offset: String(pages.length),
			postType: 'case_study',
			filters: JSON.stringify([{ taxonomy: 'country', term_id: term }]),
			view: 'gallery'
		});
		const resp = await get(`${AJAX_URL}?${query}`);
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${AJAX_URL}: ${resp.status}`);
		}
		const answer = (await resp.json()) as Answer;
		const cards = [...markup(answer.html ?? '').matchAll(CARD)].map((m) => key(m[1]));
		pages.push(...cards);
		if (cards.length === 0 || pages.length >= Number(answer.foundPosts ?? 0)) break;
	}
	return pages;
}

// the countries each company's page is filed under, as far as the filter
// would tell
async function countriesOf(get: Get): Promise<Map<string, string[]>> {
	const held = new Map<string, string[]>();
	try {
		const resp = await get(PAGE_URL);
		if (!resp.ok) return held;
		const html = await resp.text();
		const nonce = html.match(NONCE)?.[1];
		if (!nonce) return held;
		for (const [, term, label] of html.matchAll(COUNTRY)) {
			const country = tag(label);
			if (!country) continue;
			for (const page of await filedUnder(get, nonce, term)) {
				const countries = held.get(page) ?? [];
				if (!countries.includes(country)) held.set(page, [...countries, country]);
			}
		}
	} catch {
		// the door is shut: what it told so far stands
	}
	return held;
}

// what a company's page says, or nothing when it will not load
async function detailOf(get: Get, page: string): Promise<Detail | null> {
	try {
		const resp = await get(page);
		if (!resp.ok) return null;
		const html = await resp.text();
		const main = html.includes('<main') ? html.slice(html.indexOf('<main'), html.indexOf('</main>')) : html;
		const facts = [...main.matchAll(FACT)].map(([, label, values]) => ({
			label: clean(label),
			values: [...values.matchAll(VALUE)].map((m) => tag(m[2])).filter(Boolean)
		}));
		const said = (label: RegExp) => facts.filter((fact) => label.test(fact.label)).flatMap((fact) => fact.values);
		return {
			sectors: said(/^sector/i).filter((sector) => !OTHER.test(sector)),
			universities: said(/^universit/i),
			stage: said(/^stage/i)[0] ?? '',
			year: said(/^investment year/i).join(' ').match(/\b(?:19|20)\d{2}\b/)?.[0] ?? '',
			site: unescape(main.match(SITE)?.[1] ?? '').trim()
		};
	} catch {
		return null;
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const get = paced();

	const posts: Post[] = [];
	for (let page = 1, pages = 1; page <= pages && page <= 20; page++) {
		const url = `${API_URL}&page=${page}`;
		const resp = await get(url, { Accept: 'application/json' });
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${url}: ${resp.status}`);
		}
		posts.push(...((await resp.json()) as Post[]));
		pages = Number(resp.headers.get('x-wp-totalpages') ?? '1') || 1;
	}
	if (posts.length === 0) {
		throw new Error('creatorfund: no companies in the investments listing');
	}

	const countries = await countriesOf(get);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const post of posts) {
		const name = clean(post.title?.rendered ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const detail = post.link ? await detailOf(get, post.link) : null;
		const stage = detail?.stage ?? '';
		const exited = EXITS.test(stage);
		const buyer = exited ? tag(clean(post.excerpt?.rendered ?? '').match(ACQUIRED)?.[1] ?? '') : '';
		companies.push({
			name,
			category: [
				...(detail?.sectors ?? []),
				...(detail?.universities ?? []),
				...(countries.get(key(post.link ?? '')) ?? []),
				detail?.year ? `Invested ${detail.year}` : '',
				// how the exit went: the buyer the description names, or else
				// whatever the stage says beyond "Exited"
				buyer ? `Acquired by ${buyer}` : exited && !/^exit(ed)?$/i.test(stage) ? stage : '',
				exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: detail?.site || post.link || PAGE_URL
		});
	}

	return companies;
}
