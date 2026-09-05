import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://okapivc.com/portfolio/';

// wordpress on divi. the page draws a wall of logos, but everything the fund
// knows about a company is written into the tile that holds it: the name, the
// company's own address, what it files it under, and where it sits. so the
// tiles are read rather than the wall, and nothing has to be taken off a logo.
//
// the wall is in two halves under their own headings, Active Companies and
// Exited Companies, and the fund marks an exit nowhere else — so which half a
// tile falls in is what says whether the company has gone.
//
// the fund is behind sucuri, which serves whatever it holds in cache to
// anyone but is choosy about what it passes on to the site: a request
// wearing a browser's user-agent without being one is refused (403) on a
// cache miss, while a plain fetch that claims nothing is let through. so
// this request goes out bare, and the 403 branch below remains for whatever
// sucuri may still hold against a datacenter address.

const TILE = /<div class="single-port"([^>]*)>/g;
const EXITED = /<h2>\s*Exited Companies\s*<\/h2>/;
const attr = (source: string, name: string) =>
	new RegExp(`\\b${name}="([^"]*)"`).exec(source)?.[1] ?? '';

const un = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

// one name was typed with a zero-width space in front of it, which is nothing
// a reader can see and nothing a search would ever match
const clean = (s: string) =>
	un(s)
		.replace(/[​-‍﻿]/g, '')
		.replace(/\s+/g, ' ')
		.trim();

// the category is comma-joined, so a place written "Irvine, CA" would read as
// two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL);
	if (resp.status === 403) {
		throw new Error('okapi: sucuri refused this request (403)');
	}
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	// where the wall turns from the companies the fund holds to the ones it held
	const turns = html.search(EXITED);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const match of html.matchAll(TILE)) {
		const tile = match[1];
		const name = clean(attr(tile, 'data-title'));
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const exited = turns !== -1 && match.index > turns;
		companies.push({
			name,
			category: [tag(attr(tile, 'data-type')), tag(attr(tile, 'data-location')), exited ? 'Exited' : '']
				.filter(Boolean)
				.join(', '),
			url: clean(attr(tile, 'data-link'))
		});
	}

	if (companies.length === 0) {
		throw new Error('okapi: no companies in the portfolio');
	}

	return companies;
}
