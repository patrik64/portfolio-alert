import type { ScrapedCompany } from './types';

const BASE_URL = 'https://crosscut.vc';
const PAGE_URL = `${BASE_URL}/companies/`;
const AJAX_URL = `${BASE_URL}/wp-admin/admin-ajax.php`;
// the further pages and the filtered listings are asked for one at a time,
// a pause between them
const PACE_MS = 150;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, a theme of its own: the companies page shows two dozen tiles
// and scrolls the rest in through admin-ajax, a page at a time on the query
// the page hands its script; each tile names the company, tells what it
// does, who founded it, where it is and the sector, and links its site.
// the page's filters go through the same door, so the status filter is
// asked for the acquired and the listed, to know which tiles are exits.

const PARAMS = /var loadmore_params = (\{[\s\S]*?\});/;
const ITEM = /(?=<div class="item"\s)/;
const NAME = /class="title">\s*<h3[^>]*>([\s\S]*?)<\/h3>/;
const LINK = /class="link">\s*<a\b[^>]*\bhref="([^"]*)"/;
const FACT = /class="col-f__item">\s*<div class="title">([\s\S]*?)<\/div>\s*<div class="text">([\s\S]*?)<\/div>/g;
const STATUS = /<input\b[^>]*\bname="status\[\]"[^>]*\btitle="([^"]*)"[^>]*\bvalue="([^"]*)"/g;
const EXITS = /^(acquired|ipo|exited|merged|public)$/i;
const STEALTH = /^stealth\b/i;

interface Params {
	posts?: string;
}

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

// one label is typed with an invisible direction mark after it
const clean = (s: string) =>
	unescape(s.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' '))
		.replace(/[\u200b-\u200f\u2060\ufeff]/g, '')
		.replace(/\s+/g, ' ')
		.trim();

// the category is comma-joined, so a place written "Austin, TX" would read
// as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// what admin-ajax answers to a form, as text
async function post(fields: Record<string, string>): Promise<string> {
	const resp = await fetch(AJAX_URL, {
		method: 'POST',
		headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams(fields).toString()
	});
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${AJAX_URL}: ${resp.status}`);
	}
	return resp.text();
}

// the tiles of a listing, page by page after the first, on its query
async function morePages(query: string, first: string): Promise<string[]> {
	const pages = [first];
	for (let page = 1; page <= 30; page++) {
		await wait(PACE_MS);
		const html = await post({ action: 'loadmorebutton', query, page: String(page) });
		if (!html.trim()) break;
		pages.push(html);
	}
	return pages;
}

const namesIn = (html: string) => html.split(ITEM).slice(1).map((item) => clean(item.match(NAME)?.[1] ?? ''));

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const params = JSON.parse(html.match(PARAMS)?.[1] ?? '{}') as Params;
	if (!params.posts) {
		throw new Error('crosscut: the companies page hands its script no query to page on');
	}
	const listing = (await morePages(params.posts, html)).join('\n');

	// the status filter tells which tiles are exits, and how
	const outcomes = new Map<string, string>();
	for (const [, title, value] of html.matchAll(STATUS)) {
		if (!EXITS.test(clean(title))) continue;
		await wait(PACE_MS);
		const answer = JSON.parse(await post({ action: 'myfilter', 'status[]': value })) as {
			content?: string;
			posts?: string;
			max_page?: number | string;
		};
		const pages =
			Number(answer.max_page ?? 1) > 1 && answer.posts
				? await morePages(answer.posts, answer.content ?? '')
				: [answer.content ?? ''];
		for (const name of namesIn(pages.join('\n'))) {
			if (name) outcomes.set(name.toLowerCase(), clean(title));
		}
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of listing.split(ITEM).slice(1)) {
		const name = clean(item.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const facts = new Map([...item.matchAll(FACT)].map(([, label, value]) => [clean(label).toLowerCase(), value]));
		const outcome = outcomes.get(name.toLowerCase()) ?? '';
		companies.push({
			name,
			category: [tag(facts.get('sector') ?? ''), tag(facts.get('location') ?? ''), outcome, outcome ? 'Exited' : '']
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: unescape(item.match(LINK)?.[1] ?? '').trim() || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('crosscut: no companies on the companies page');
	}

	return companies;
}
