import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://collidecap.com/portfolio';
const MAX_PAGES = 30;
const PACE_MS = 150;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, a collection list that finsweet loads ten cards at a time: the
// list is walked here through webflow's own "next" links. a card links the
// company's site and names its fields for the filters — the name, the ceo,
// the thesis it falls under ("Fintech", "Supply Chain", "Future of Work",
// or "Other", which says nothing and is dropped), the year the fund came
// in, a line about it, the state it is in, and its market ("B2B",
// "Enterprise", "Consumer") — and an "ACQUIRED" badge that webflow shows
// on the companies sold. a page of the list that will not come fails the
// run, rather than take a part of the list for the whole.

const ITEM = /(?=<div\b[^>]*\brole="listitem")/;
const LINK = /<a\b[^>]*\bhref="([^"]*)"/;
// a field of the card, as the filters read it
const FIELD = /<(\w+)\b[^>]*\bfs-cmsfilter-field="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g;
const BADGE = /<div\b[^>]*\bfs-cmsfilter-field="Acquired"[^>]*\bclass="([^"]*)"/;
const NEXT = /href="(\?[a-z0-9_]+_page=\d+)"[^>]*class="[^"]*w-pagination-next/;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let url = PAGE_URL;
	for (let page = 0; url && page < MAX_PAGES; page++) {
		if (page > 0) await wait(PACE_MS);
		const html = await fetchText(url);
		// the cards end where the list's pagination begins
		const next = html.match(NEXT)?.[1];
		const list = html.split(/<div\b[^>]*\bclass="w-pagination-wrapper/)[0];
		for (const item of list.split(ITEM).slice(1)) {
			const fields = new Map<string, string>();
			for (const [, , field, value] of item.matchAll(FIELD)) {
				if (!fields.has(field.toLowerCase())) fields.set(field.toLowerCase(), tag(value));
			}
			const name = fields.get('name') ?? '';
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			const badge = item.match(BADGE)?.[1];
			const acquired = badge !== undefined && !/\bw-condition-invisible\b/.test(badge);
			const year = fields.get('year')?.match(/\b(?:19|20)\d{2}\b/)?.[0];
			const site = unescape(item.match(LINK)?.[1] ?? '').trim();
			companies.push({
				name,
				category: [
					/^other$/i.test(fields.get('tag') ?? '') ? '' : (fields.get('tag') ?? ''),
					fields.get('location') ?? '',
					fields.get('bm') ?? '',
					fields.get('tags') ?? '',
					year ? `Invested ${year}` : '',
					acquired ? 'Acquired' : '',
					acquired ? 'Exited' : ''
				]
					.filter((t, i, all) => t && all.indexOf(t) === i)
					.join(', '),
				url: /^https?:\/\//i.test(site) ? site : PAGE_URL
			});
		}
		url = next ? `${PAGE_URL}${unescape(next)}` : '';
	}
	if (companies.length === 0) {
		throw new Error('collide: no companies on the portfolio page');
	}

	return companies;
}
