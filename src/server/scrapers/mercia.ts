import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.mercia.co.uk';
const PAGE_URL = `${BASE_URL}/about-us/portfolio/`;
const API_URL = `${BASE_URL}/wp-json/wp/v2`;
const MAX_PAGES = 20;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the portfolio page loads its grid of logos in the browser, a
// screen at a time, from the site's "portfolio" posts, which the site's own
// api serves whole: each company's name, a line about it — with a link to
// its site, about half the time — its sector ("Software & the Internet",
// "Life Sciences & Biosciences"), the funds it was backed from ("Northern
// VCTs", "NPIF Equity", and debt funds too, "NPIF Debt", "SME Loans") and
// its status ("Unrealised", "Realised", "Partially realised"). the sector
// and the funds are kept as tags, a realised holding with the Exited tag and
// a part-realised one as written. a company with no link of its own links
// its page here. every page of the api must load.

const UNSAID = /^(?:-|other|others|all|n\/a|all funds)$/i;
const REALISED = /^realised$/i;
const PART_REALISED = /^partially realised$/i;
const STEALTH = /^stealth\b/i;
const LINK = /href="(https?:\/\/[^"]+)"/g;
const NOT_A_SITE = /^https?:\/\/(?:[\w-]+\.)*(?:mercia\.co\.uk|linkedin\.com|twitter\.com|x\.com|facebook\.com|youtube\.com)(?:[/?#]|$)/i;

interface Post {
	link?: string;
	title?: { rendered?: string };
	content?: { rendered?: string };
	fund_type?: number[];
	sector?: number[];
	status?: number[];
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
		.replace(/&#8211;|&ndash;/g, '–')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// every item of an api collection, a hundred at a time; a part of it must
// not pass for the whole
async function all<T>(path: string): Promise<T[]> {
	const items: T[] = [];
	for (let page = 1, pages = 1; page <= pages && page <= MAX_PAGES; page++) {
		const resp = await fetch(`${API_URL}/${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`, {
			headers: { 'User-Agent': UA, Accept: 'application/json' }
		});
		if (!resp.ok) {
			throw new Error(`mercia: the site's api answered ${resp.status} for ${path.split('?')[0]}`);
		}
		pages = Number(resp.headers.get('x-wp-totalpages')) || 1;
		items.push(...((await resp.json()) as T[]));
	}
	return items;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const [posts, funds, sectors, statuses] = await Promise.all([
		all<Post>('portfolio?_fields=link,title,content,fund_type,sector,status'),
		all<Term>('fund_type?_fields=id,name'),
		all<Term>('sector?_fields=id,name'),
		all<Term>('status?_fields=id,name')
	]);
	const names = (terms: Term[]) => new Map(terms.map((t) => [t.id, clean(t.name ?? '')]));
	const [fund, sector, status] = [names(funds), names(sectors), names(statuses)];
	const terms = (ids: number[] | undefined, by: Map<number | undefined, string>) => (ids ?? []).map((id) => by.get(id) ?? '');

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const post of posts) {
		const name = clean(post.title?.rendered ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const states = terms(post.status, status);
		const site = [...(post.content?.rendered ?? '').matchAll(LINK)]
			.map(([, href]) => unescape(href).trim())
			.find((href) => !NOT_A_SITE.test(href));
		companies.push({
			name,
			category: [
				...terms(post.sector, sector).map(tag),
				...terms(post.fund_type, fund).map(tag),
				...states.filter((s) => PART_REALISED.test(s)).map(tag),
				states.some((s) => REALISED.test(s)) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: site || clean(post.link ?? '') || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error("mercia: the site's api lists no portfolio companies");
	}

	return companies;
}
