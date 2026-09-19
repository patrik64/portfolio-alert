import type { ScrapedCompany } from './types';

const BASE_URL = 'https://innospark.vc';
const PAGE_URL = `${BASE_URL}/portfolio/`;
const ROSTER_URL = `${BASE_URL}/wp-json/wp/v2/portfolio?per_page=100&orderby=title&order=asc&_fields=title,portfolio-category`;
const SECTORS_URL = `${BASE_URL}/wp-json/wp/v2/portfolio-category?per_page=100&_fields=id,name`;
const MAX_PAGES = 10;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress built with bricks. the portfolio page scrolls without end,
// sixteen companies at a time, and what it knows of a company — its site,
// whether it is still private, where it sits — is in a popup that arrives
// with the company's card. the companies' own pages are empty templates.
//
// so the roster comes from the rest api, which lists every company with its
// sector in one answer and cannot come up short, and the popups fill in the
// rest: the first page's from the html, the later pages' from the endpoint
// the page itself calls on scrolling, with the nonce it hands every visitor.
// should that endpoint refuse, the companies of the later pages are still
// returned, without a site, rather than dropped — a short list one night
// would make newcomers of them the next.

interface Post {
	title?: { rendered?: string };
	'portfolio-category'?: number[];
}

interface Term {
	id: number;
	name?: string;
}

interface Details {
	url: string;
	status: string;
	location: string;
}

const POPUP = /(?=<div[^>]*class="brx-popup brxe-popup-)/;
const IS_POPUP = /^<div[^>]*class="brx-popup /;
const NAME = /<h3 class="[^"]*brxe-post-title[^"]*">([\s\S]*?)<\/h3>/;
const SITE = /<a[^>]*class="[^"]*bc-arrow-button[^"]*"[^>]*href="(https?:\/\/[^"]+)"/;
const field = (label: string) =>
	new RegExp(`<h4[^>]*>\\s*${label}\\s*</h4>\\s*<h4[^>]*>([\\s\\S]*?)</h4>`, 'i');
const STATUS = field('status');
const LOCATION = field('location');
const TRAIL = /<a class="brx-query-trail brx-infinite-scroll"[^>]*>/;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&#8211;|&ndash;/g, '–')
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) =>
	unescape(s.replace(/<[^>]+>/g, ''))
		.replace(/\s+/g, ' ')
		.trim();

async function fetchJson<T>(url: string): Promise<T> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return (await resp.json()) as T;
}

function readPopups(html: string, details: Map<string, Details>) {
	// the page has markup ahead of its first popup and the endpoint's answer
	// begins with one, so the pieces are told apart by how they start
	for (const popup of html.split(POPUP).filter((piece) => IS_POPUP.test(piece))) {
		const name = clean(popup.match(NAME)?.[1] ?? '');
		if (!name || details.has(name.toLowerCase())) continue;
		details.set(name.toLowerCase(), {
			url: unescape(popup.match(SITE)?.[1] ?? ''),
			status: clean(popup.match(STATUS)?.[1] ?? ''),
			location: clean(popup.match(LOCATION)?.[1] ?? '')
		});
	}
}

// the later pages, asked for the way the page asks for them
async function readLaterPages(page: string, details: Map<string, Details>) {
	const trail = page.match(TRAIL)?.[0] ?? '';
	const attr = (name: string) => trail.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? '';
	const pages = Math.min(Number(attr('data-max-pages')) || 1, MAX_PAGES);
	const nonce = page.match(/"nonce":"([^"]+)"/)?.[1];
	const postId = page.match(/"postId":"?(\d+)/)?.[1];
	const queryElementId = attr('data-query-element-id');
	if (pages < 2 || !nonce || !postId || !queryElementId) return;

	for (let at = 2; at <= pages; at++) {
		const resp = await fetch(`${BASE_URL}/wp-json/bricks/v1/load_query_page`, {
			method: 'POST',
			headers: { 'User-Agent': UA, 'Content-Type': 'application/json' },
			body: JSON.stringify({
				postId,
				queryElementId,
				page: at,
				nonce,
				queryVars: unescape(attr('data-query-vars'))
			})
		});
		if (!resp.ok) return;
		const answer = (await resp.json()) as { popups?: string };
		readPopups(answer.popups ?? '', details);
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const [roster, terms] = await Promise.all([
		fetchJson<Post[]>(ROSTER_URL),
		fetchJson<Term[]>(SECTORS_URL)
	]);
	const sectors = new Map(terms.map((term) => [term.id, clean(term.name ?? '')]));

	const details = new Map<string, Details>();
	try {
		const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
		if (resp.ok) {
			const page = await resp.text();
			readPopups(page, details);
			await readLaterPages(page, details);
		}
	} catch {
		// the roster stands on its own; the sites are the loss
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const post of roster) {
		const name = clean(post.title?.rendered ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const known = details.get(name.toLowerCase());
		companies.push({
			name,
			category: [
				...(post['portfolio-category'] ?? []).map((id) => sectors.get(id) ?? ''),
				// private is the rule; what is worth recording is the exception
				known && !/^private$/i.test(known.status) ? known.status : '',
				known?.location ?? ''
			]
				.filter(Boolean)
				.join(', '),
			url: known?.url ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('innospark: the rest api lists no portfolio companies');
	}

	return companies;
}
