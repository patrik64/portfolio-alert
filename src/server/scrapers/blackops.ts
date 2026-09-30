import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.blackopsvc.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js: the portfolio page is a wall of founders' portraits, each
// captioned with the company and the founder, and the page's data — the
// stream next.js writes into the page as string literals — carries the
// companies as items: the name, a line about it, its site and the sectors
// the filter above the wall reads ("future of work", "propTech"), which
// are given a capital where they are typed without one. nothing marks an
// exit.

const ITEMS = /"items":\[/;
const STEALTH = /^stealth\b/i;

interface Item {
	name?: string;
	website_url?: string;
	categories?: { name?: string }[];
}

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/\s*,\s*/g, ' / ');

const capital = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// next.js streams the page's data as javascript string literals
function flightPayload(html: string): string {
	const chunks: string[] = [];
	for (const push of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
		try {
			chunks.push(JSON.parse(push[1]));
		} catch {
			// a chunk that will not parse is one the page never used either
		}
	}
	return chunks.join('');
}

// the array that opens at a point in the payload, to its matching close
function arrayAt(payload: string, start: number): string {
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let i = start; i < payload.length; i++) {
		const c = payload[i];
		if (escaped) escaped = false;
		else if (c === '\\') escaped = true;
		else if (c === '"') inString = !inString;
		else if (!inString) {
			if (c === '[') depth++;
			else if (c === ']' && --depth === 0) return payload.slice(start, i + 1);
		}
	}
	return '';
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const payload = flightPayload(await resp.text());
	const at = payload.search(ITEMS);
	if (at < 0) {
		throw new Error('blackops: the page carries no items in its data');
	}
	const items = JSON.parse(arrayAt(payload, payload.indexOf('[', at))) as Item[];

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of items) {
		const name = (item.name ?? '').replace(/\s+/g, ' ').trim();
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const site = (item.website_url ?? '').trim();
		companies.push({
			name,
			category: (item.categories ?? [])
				.map((c) => capital(tag(c.name ?? '')))
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('blackops: no companies in the portfolio data');
	}

	return companies;
}
