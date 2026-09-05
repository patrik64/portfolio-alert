import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.paladincapgroup.com';
const API_URL = `${BASE_URL}/wp-json/wp/v2`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const PAGE_SIZE = 100;
const BATCH_SIZE = 8;

// wordpress, with the portfolio as its own post type and the rest api left
// open, so the list comes back as json rather than out of the elementor markup
// the page is built from.
//
// the api holds the name and the sectors the fund files a company under, but
// not where the company is or whether the fund still holds it, and not the
// company's own site. all three are on the company's page, so each one is
// fetched.
//
// the fund also records when it first invested. that is the shape of the
// holding rather than anything about the company, so it is left out.

const un = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));

const clean = (s: string) => un(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a place written "Durham, NC, USA" would
// read as three tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// a company's page carries its details as a row of elementor icon boxes, a
// label over a value. the boxes are split apart first so that a label left
// with nothing under it — which is how five companies have their status —
// cannot pick up the next box's value
const BOX = /elementor-widget-icon-box[\s\S]*?(?=elementor-widget-icon-box|$)/g;
const LABEL = /class="elementor-icon-box-title"[^>]*>([\s\S]*?)<\/h\d>/;
const VALUE = /class="elementor-icon-box-description"[^>]*>([\s\S]*?)<\/p>/;

// the fund's own link sits in a row of social icons under the generic "link"
// icon, with linkedin and x beside it
const SITE =
	/<a class="elementor-icon elementor-social-icon elementor-social-icon-link[ "][^>]*href="(https?:\/\/[^"]+)"/;

// the sector the fund reaches for when none of the three it names fits, which
// says nothing about the company
const CATCHALL = /^other$/i;
// the status of a company the fund still holds
const HELD = /^current$/i;

interface Term {
	id?: number;
	name?: string;
}

interface Post {
	title?: { rendered?: string };
	link?: string;
	sector?: number[];
}

async function get(url: string): Promise<Response> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp;
}

async function sectors(): Promise<Map<number, string>> {
	const resp = await get(`${API_URL}/sector?per_page=${PAGE_SIZE}`);
	const terms = (await resp.json()) as Term[];
	return new Map(terms.filter((t) => t.id && t.name).map((t) => [t.id as number, t.name as string]));
}

async function posts(): Promise<Post[]> {
	const found: Post[] = [];
	let pages = 1;
	for (let page = 1; page <= pages; page++) {
		const resp = await get(`${API_URL}/portfolio?per_page=${PAGE_SIZE}&page=${page}`);
		if (page === 1) {
			pages = Number(resp.headers.get('x-wp-totalpages')) || 1;
		}
		found.push(...((await resp.json()) as Post[]));
	}
	return found;
}

async function fetchCompany(post: Post, named: Map<number, string>): Promise<ScrapedCompany | null> {
	const name = clean(post.title?.rendered ?? '');
	if (!name || !post.link) return null;

	const resp = await fetch(post.link, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${post.link}: ${resp.status}`);
	}
	const html = await resp.text();

	const fields = new Map<string, string>();
	for (const box of html.match(BOX) ?? []) {
		const label = clean(box.match(LABEL)?.[1] ?? '').replace(/:$/, '');
		if (label) fields.set(label, clean(box.match(VALUE)?.[1] ?? ''));
	}

	const status = fields.get('Investment Status') ?? '';
	return {
		name,
		category: [
			...(post.sector ?? [])
				.map((id) => named.get(id) ?? '')
				.filter((sector) => sector && !CATCHALL.test(sector))
				.map(tag),
			tag(fields.get('Location') ?? ''),
			HELD.test(status) ? '' : tag(status)
		]
			.filter(Boolean)
			.join(', '),
		url: html.match(SITE)?.[1] ?? ''
	};
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const [named, all] = await Promise.all([sectors(), posts()]);
	if (all.length === 0) {
		throw new Error('paladin: no companies in the portfolio');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (let i = 0; i < all.length; i += BATCH_SIZE) {
		const found = await Promise.all(all.slice(i, i + BATCH_SIZE).map((p) => fetchCompany(p, named)));
		for (const company of found) {
			if (!company || seen.has(company.name.toLowerCase())) continue;
			seen.add(company.name.toLowerCase());
			companies.push(company);
		}
	}

	if (companies.length === 0) {
		throw new Error('paladin: no companies behind the portfolio list');
	}

	return companies;
}
