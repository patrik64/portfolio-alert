import type { ScrapedCompany } from './types';

const BASE_URL = 'https://imecxpand.com';
const PAGE_URL = `${BASE_URL}/en/portfolio`;
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
// no company page is begun past this, leaving the run its time
const DEADLINE_MS = 150_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js: the portfolio page is a grid of cards drawn from a list in
// react's payload, the whole of it in the page, a company each with its
// name, a line on what it makes ("Silicon-based quantum computers"), its
// domain ("Deep tech", "Health tech") and a tag on one the fund has seen
// sold ("Acquired"), linking its page here. a company's page carries, in
// its own payload, a "Visit website" button with its site. the domain is
// kept as a tag, a sale with the Acquired tag. a company page that will
// not load, or is not reached by the deadline, leaves its company linking
// it.
//
// the payload arrives as a run of javascript string literals that have to
// be unescaped and joined before the json inside them can be read.

const CHUNK = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
// the grid's list: an array whose items open on a company page's address
const ITEMS = /"items":(?=\[\{"url":"\/en\/portfolio\/)/;
const BUTTON = /"button":(?=\{)/g;
const ACQUIRED = /^acquired$/i;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

interface Item {
	url?: string;
	title?: string;
	tags?: string[] | null;
	domain?: string | null;
}

interface Button {
	url?: string;
	href?: string;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// the json value opening at start — an object or an array — up to its close
function jsonAt(text: string, start: number): unknown {
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let i = start; i < text.length; i++) {
		const c = text[i];
		if (escaped) escaped = false;
		else if (c === '\\') escaped = true;
		else if (c === '"') inString = !inString;
		else if (!inString) {
			if (c === '{' || c === '[') depth++;
			else if ((c === '}' || c === ']') && --depth === 0) {
				try {
					return JSON.parse(text.slice(start, i + 1));
				} catch {
					return undefined;
				}
			}
		}
	}
	return undefined;
}

const payloadOf = (html: string) =>
	[...html.matchAll(CHUNK)].map(([, literal]) => JSON.parse(literal) as string).join('');

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// a page, or a refusal waited out once
async function get(url: string): Promise<Response> {
	const headers = { 'User-Agent': UA };
	const resp = await fetch(url, { headers });
	if (resp.status !== 429) return resp;
	await resp.body?.cancel();
	await wait(REFUSED_MS);
	return fetch(url, { headers });
}

// a company page's site — its first button leading off the fund's own — or nothing
async function siteOf(href: string): Promise<string> {
	try {
		const resp = await get(href);
		if (!resp.ok) {
			await resp.body?.cancel();
			return '';
		}
		const payload = payloadOf(await resp.text());
		for (const match of payload.matchAll(BUTTON)) {
			const button = jsonAt(payload, match.index + match[0].length) as Button | undefined;
			const site = clean(button?.url ?? button?.href ?? '');
			if (/^https?:\/\//i.test(site) && !/^https?:\/\/(?:www\.)?imecxpand\.com\b/i.test(site)) return site;
		}
		return '';
	} catch {
		return '';
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const started = Date.now();
	const resp = await get(PAGE_URL);
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const payload = payloadOf(await resp.text());
	const at = payload.match(ITEMS);
	const items = at?.index === undefined ? undefined : jsonAt(payload, at.index + at[0].length);
	if (!Array.isArray(items) || items.length === 0) {
		throw new Error("imecxpand: the page's payload carries no portfolio list — the page moved");
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const item of items as Item[]) {
		const name = clean(item?.title ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const href = item.url ? new URL(item.url, BASE_URL).href : '';
		const reached = !!href && Date.now() - started < DEADLINE_MS;
		if (reached && companies.length > 0) await wait(PACE_MS);
		const site = reached ? await siteOf(href) : '';
		if (site) withSite++;
		const tags = (item.tags ?? []).map(clean);
		companies.push({
			name,
			category: [
				tag(item.domain ?? ''),
				...tags.filter((t) => !ACQUIRED.test(t)).map(tag),
				tags.some((t) => ACQUIRED.test(t)) ? 'Acquired' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: site || href || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('imecxpand: the portfolio names no companies');
	}
	// without the company pages every company would link its page here
	if (withSite === 0) {
		throw new Error("imecxpand: no company page gave its site — the pages' markup moved");
	}

	return companies;
}
