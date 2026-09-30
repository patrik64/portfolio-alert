import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.clevelandavenue.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: under the month's featured companies, the portfolio is a grid
// of tiles, each the company's name over a photo, a line about it, a link
// to its site, the types the filter reads ("Food & Beverage",
// "Robotics/AI") and, on the ones the fund is out of, when it got out
// ("Exited May 2025"), which webflow hides where it is empty. one type,
// "CAST US", is on a handful of tiles but hidden from the filter, so it is
// not kept either: a type the page's own filter hides is not a category.
// the filter runs in the browser, so the page holds every tile; the
// featured companies are all in the grid again.

const TILE = /(?=<div\b[^>]*\bclass="collection-item grid\b)/;
const NAME = /<h2\b[^>]*\bclass="thumbnail-title"[^>]*>([\s\S]*?)<\/h2>/;
const SITE = /<a\b[^>]*\bhref="([^"]*)"[^>]*\bclass="website-link-wrap\b/;
const EXIT = /<div\b[^>]*\bclass="(exit-date[^"]*)"[^>]*>([\s\S]*?)<\/div>/;
const TYPE = /<div\b[^>]*\bfs-cmsfilter-field="Type"[^>]*>([\s\S]*?)<\/div>/g;
// a filter checkbox webflow hides, and the type it would filter by
const HIDDEN = /<label\b[^>]*\bclass="[^"]*\bw-condition-invisible\b[^"]*"[^>]*>[\s\S]*?fs-cmsfilter-field="Type"[^>]*>([\s\S]*?)<\/span>/g;
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

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const hidden = new Set([...html.matchAll(HIDDEN)].map(([, type]) => tag(type).toLowerCase()));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const chunk of html.split(TILE).slice(1)) {
		// a tile ends with its types; what follows the last of them is not its own
		const types = [...chunk.matchAll(TYPE)];
		const last = types[types.length - 1];
		const tile = last ? chunk.slice(0, (last.index ?? 0) + last[0].length) : chunk;
		const name = clean(tile.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const exit = tile.match(EXIT);
		const exited = exit && !/\bw-condition-invisible\b/.test(exit[1]) ? tag(exit[2]) : '';
		const site = unescape(tile.match(SITE)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [
				...types.map(([, type]) => tag(type)).filter((t) => !hidden.has(t.toLowerCase())),
				exited,
				exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('clevelandavenue: no companies on the portfolio page');
	}

	return companies;
}
