import type { ScrapedCompany } from './types';

const BASE_URL = 'https://unitedventures.com';
const PAGE_URL = `${BASE_URL}/portfolio/`;
const API_URL = `${BASE_URL}/wp-json/wp/v2/portfolio`;
// the company pages are asked for one at a time, a second apart: at the
// usual pace cloudflare, in front of the site, turns some away with a 429
const PACE_MS = 1_000;
const REFUSED_MS = 20_000;
const MAX_PAGES = 20;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the portfolio page is a grid of logos, a company each, linking
// its page here and named nowhere on the card, so the cards, which decide
// who is listed, are matched by their post's id to the site's own api for
// the company's name — the one the fund files it under, which a company's
// page sometimes writes out longer ("xFarm Technologies"). a company's page
// adds its site and its sector ("Cybersecurity", "Retail / CX"), kept as a
// tag; the fund does not say which companies it is out of. a card the api
// does not know fails the run; a company page that will not load leaves
// its company linking it.

const CARD = /<a\s+href="([^"]*)"\s*>\s*<article\b[^>]*\bclass="post-(\d+) portfolio\b/g;
const SITE = /<section class="hero\b[^"]*"\s*>[\s\S]*?<a class="h4"[^>]*\bhref="([^"]*)"/;
const SECTOR = /class="wrapper-text__details--sector"\s*>\s*<p>[\s\S]*?<\/p>\s*<p>([\s\S]*?)<\/p>/;
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
		.replace(/&ndash;/g, '–')
		.replace(/&mdash;/g, '—')
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

interface Page {
	site: string;
	sector: string;
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
		const site = unescape(html.match(SITE)?.[1] ?? '').trim();
		return { site: /^https?:\/\//i.test(site) ? site : '', sector: clean(html.match(SECTOR)?.[1] ?? '') };
	} catch {
		return null;
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await get(PAGE_URL);
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const cards = new Map<number, string>();
	for (const [, href, id] of html.matchAll(CARD)) {
		if (!cards.has(Number(id))) cards.set(Number(id), unescape(href).trim());
	}
	if (cards.size === 0) {
		throw new Error('unitedventures: no companies on the portfolio page — the markup moved');
	}

	// the names, from the site's api, a hundred at a time
	const names = new Map<number, string>();
	for (let page = 1, pages = 1; page <= pages && page <= MAX_PAGES; page++) {
		const answer = await get(`${API_URL}?per_page=100&page=${page}&_fields=id,title`, 'application/json');
		if (!answer.ok) {
			throw new Error(`unitedventures: the site's api answered ${answer.status}`);
		}
		pages = Number(answer.headers.get('x-wp-totalpages')) || 1;
		for (const post of (await answer.json()) as Post[]) {
			if (post.id) names.set(post.id, clean(post.title?.rendered ?? ''));
		}
	}
	// a part of the list must not pass for the whole
	const missing = [...cards.keys()].filter((id) => !names.get(id));
	if (missing.length > 0) {
		throw new Error(`unitedventures: ${missing.length} of the portfolio's companies are not in the site's api`);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const [id, href] of cards) {
		const name = names.get(id)!;
		if (STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		if (companies.length > 0) await wait(PACE_MS);
		const page = href.startsWith(`${BASE_URL}/`) ? await pageOf(href) : null;
		if (page?.site) withSite++;
		companies.push({ name, category: tag(page?.sector ?? ''), url: page?.site || href || PAGE_URL });
	}
	// without the company pages every company would link its page here
	if (withSite === 0) {
		throw new Error("unitedventures: no company page gave its site — the pages' markup moved");
	}

	return companies;
}
