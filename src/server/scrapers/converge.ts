import type { ScrapedCompany } from './types';

const BASE_URL = 'https://converge.vc';
const PAGE_URL = `${BASE_URL}/portfolio/`;
const POSTS_URL = `${BASE_URL}/wp-json/wp/v2/portfolio?per_page=100&_fields=title,link,portfolio-sector`;
const TERMS_URL = `${BASE_URL}/wp-json/wp/v2/portfolio-sector?per_page=100&_fields=id,name`;
const MAX_PAGES = 5;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the portfolio page is a grid of cards, each naming the company
// in a heading over a line about it, with a "Visit Site" link to its site
// (ten, long exited, have none), a corner badge — "Acquired" or "IPO" — for
// a company the fund is out of, and a note under it that may name the buyer
// ("Acquired by Qlik"), which is kept as the tag in place of the bare badge;
// a note saying who made the investment at an earlier firm is not a tag.
// the sector filter above the grid works from the posts' taxonomy, which
// the cards do not carry, so the sectors come from the site's rest api — the
// portfolio posts with their term ids, and the terms' names — and are joined
// to the cards by name. "Exited" is a term there too and counts as the badge
// does. a company without a site links its page on the fund's site, which
// the posts name.

const CARD = /(?=<div class="col-md-3\b[^"]*\bcol-top")/;
const NAME = /<div class="portfolio-title">\s*<h2>([\s\S]*?)<\/h2>/;
const SITE = /<a href="([^"]*)"[^>]*\bclass="hidebtn"/;
const BADGE = /<span class="type-[^"]*">([^<]*)<\/span>/;
const NOTE = /<p class="note">([\s\S]*?)<\/p>/;
const BUYER = /\bAcquired by (.+)$/i;
const EXITED = /^exited$/i;
const STEALTH = /^stealth\b/i;

interface Post {
	title?: { rendered?: string };
	link?: string;
	'portfolio-sector'?: number[];
}
interface Term {
	id: number;
	name: string;
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

const key = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

async function json<T>(url: string): Promise<T> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return (await resp.json()) as T;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const terms = new Map((await json<Term[]>(TERMS_URL)).map((t) => [t.id, tag(t.name)]));
	const posts: Post[] = [];
	for (let page = 1; page <= MAX_PAGES; page++) {
		const batch = await json<Post[]>(`${POSTS_URL}&page=${page}`);
		posts.push(...batch);
		if (batch.length < 100) break;
	}
	const byName = new Map(posts.map((p) => [key(clean(p.title?.rendered ?? '')), p]));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of html.split(CARD).slice(1)) {
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(key(name))) continue;
		seen.add(key(name));
		const post = byName.get(key(name));
		const sectors = (post?.['portfolio-sector'] ?? []).map((id) => terms.get(id) ?? '');
		const badge = clean(card.match(BADGE)?.[1] ?? '');
		const buyer = clean(clean(card.match(NOTE)?.[1] ?? '').match(BUYER)?.[1] ?? '');
		const exited = Boolean(badge) || sectors.some((s) => EXITED.test(s));
		const site = unescape(card.match(SITE)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [
				...sectors.filter((s) => !EXITED.test(s)),
				buyer ? `Acquired by ${tag(buyer)}` : tag(badge),
				exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : (post?.link ?? PAGE_URL)
		});
	}

	if (companies.length === 0) {
		throw new Error('converge: no companies on the portfolio page');
	}
	if (!companies.some((c) => c.url !== PAGE_URL && !c.url.startsWith(PAGE_URL))) {
		throw new Error("converge: the cards' links to the companies' sites moved");
	}
	if (!companies.some((c) => c.category)) {
		throw new Error('converge: the sectors did not match the cards');
	}

	return companies;
}
