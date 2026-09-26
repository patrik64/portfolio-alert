import type { ScrapedCompany } from './types';

const BASE_URL = 'https://cybernetix.vc';
const PAGE_URL = `${BASE_URL}/#portfolio`;
const API_URL = `${BASE_URL}/wp-json/wp/v2/portfolio?per_page=100&_fields=title,link`;
// the companies' pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, a theme of its own: the home page shows a handful of the
// portfolio as cards, but the rest api lists every company as a post — the
// name and its page on the fund's site, where a paragraph about it links
// its site, the first address there that is not the fund's own. so those
// pages are fetched for the sites; one that will not load leaves its
// company linking to that page. the pages of the listing are followed to
// the last. the fund files companies under nothing and marks no exit.

const LINK = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/g;
// the fund's own sites and properties, and the usual social ones
const NOISE = /cybernetix\.vc|theroboticsplaybook|roboticsinvest|roboticstechweek|linkedin\.com|twitter\.com|x\.com|youtube\.com|fonts\.|google/i;
const STEALTH = /^stealth\b/i;

interface Post {
	title?: { rendered?: string };
	link?: string;
}

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// the site a company's page links, or nothing when the page will not load
async function siteOf(page: string): Promise<string> {
	try {
		let resp = await fetch(page, { headers: { 'User-Agent': UA } });
		if (resp.status === 429) {
			await wait(20_000);
			resp = await fetch(page, { headers: { 'User-Agent': UA } });
		}
		if (!resp.ok) return '';
		const html = await resp.text();
		const main = html.includes('<main') ? html.slice(html.indexOf('<main'), html.indexOf('</main>')) : html;
		return [...main.matchAll(LINK)].map((m) => unescape(m[1])).find((u) => !NOISE.test(u)) ?? '';
	} catch {
		return '';
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const posts: Post[] = [];
	for (let page = 1, pages = 1; page <= pages && page <= 20; page++) {
		const url = `${API_URL}&page=${page}`;
		const resp = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${url}: ${resp.status}`);
		}
		posts.push(...((await resp.json()) as Post[]));
		pages = Number(resp.headers.get('x-wp-totalpages') ?? '1') || 1;
	}
	if (posts.length === 0) {
		throw new Error('cybernetix: no companies in the portfolio listing');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const post of posts) {
		const name = clean(post.title?.rendered ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		if (companies.length > 0) await wait(PACE_MS);
		const site = post.link ? await siteOf(post.link) : '';
		companies.push({ name, category: '', url: site || post.link || PAGE_URL });
	}

	return companies;
}
