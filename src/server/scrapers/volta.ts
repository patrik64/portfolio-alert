import type { ScrapedCompany } from './types';

const BASE_URL = 'https://volta.ventures';
const PAGE_URL = `${BASE_URL}/#portfolio`;
const API_URL = `${BASE_URL}/wp-json/wp/v2/portfolio-item`;
const MAX_PAGES = 20;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress with elementor: the home page shows the newest companies in a
// carousel, a name and a line each, and every company in a grid behind
// "Discover our full portfolio", all of it in the page; the grid shows only
// a logo linking the company's site. each item is a post ("post-1239
// portfolio-item"), so the items, which decide who is listed, are matched
// by their post's id to the site's own api for the name. a link carries
// the address the fund gives, an advert's tracking taken off it. the page
// sorts the companies into no sectors and does not say which the fund is
// out of; an item the api does not know fails the run.

const ITEM = /(?=<article\b[^>]*\bclass="post-\d+ portfolio-item\b)/;
const ID = /^<article\b[^>]*\bclass="post-(\d+) portfolio-item\b/;
const LINK = /<a\b[^>]*\bhref="([^"]*)"/;
// an advert's tracking: "utm_source", "gclid", "hsa_acc" and the like
const TRACKING = /^(?:utm_|hsa_|gad_|gclid$|gbraid$|wbraid$|fbclid$|msclkid$)/i;
const STEALTH = /^stealth\b/i;

interface Post {
	id?: number;
	title?: { rendered?: string };
}

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the address without an advert's tracking, or nothing when it is no address
function siteOf(href: string): string {
	try {
		const url = new URL(unescape(href).trim());
		if (!/^https?:$/.test(url.protocol)) return '';
		for (const key of [...url.searchParams.keys()]) {
			if (TRACKING.test(key)) url.searchParams.delete(key);
		}
		return url.href;
	} catch {
		return '';
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	// the fragment is the browser's, so this asks for the home page
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	// the items, each once, the carousel's and the grid's, and each one's link
	const links = new Map<number, string>();
	for (const item of html.split(ITEM).slice(1)) {
		const id = Number(item.match(ID)?.[1]);
		if (!id || links.has(id)) continue;
		links.set(id, siteOf(item.slice(0, item.indexOf('</article>')).match(LINK)?.[1] ?? ''));
	}
	if (links.size === 0) {
		throw new Error('volta: no portfolio items on the home page — the markup moved');
	}

	// the names, from the site's api, a hundred at a time
	const names = new Map<number, string>();
	for (let page = 1, pages = 1; page <= pages && page <= MAX_PAGES; page++) {
		const answer = await fetch(`${API_URL}?per_page=100&page=${page}&_fields=id,title`, {
			headers: { 'User-Agent': UA, Accept: 'application/json' }
		});
		if (!answer.ok) {
			throw new Error(`volta: the site's api answered ${answer.status}`);
		}
		pages = Number(answer.headers.get('x-wp-totalpages')) || 1;
		for (const post of (await answer.json()) as Post[]) {
			if (post.id) names.set(post.id, clean(post.title?.rendered ?? ''));
		}
	}
	// a part of the list must not pass for the whole
	const missing = [...links.keys()].filter((id) => !names.get(id));
	if (missing.length > 0) {
		throw new Error(`volta: ${missing.length} of the page's companies are not in the site's api`);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [id, site] of links) {
		const name = names.get(id)!;
		if (STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: '', url: site || PAGE_URL });
	}

	return companies;
}
