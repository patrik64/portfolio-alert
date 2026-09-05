import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://okapivc.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress on divi. the page draws a wall of logos, but everything the fund
// knows about a company is written into the tile that holds it: the name, the
// company's own address, what it files it under, and where it sits. so the
// tiles are read rather than the wall, and nothing has to be taken off a logo.
//
// the wall is in two halves under their own headings, Active Companies and
// Exited Companies, and the fund marks an exit nowhere else — so which half a
// tile falls in is what says whether the company has gone.
//
// the fund is behind sucuri, which refuses a request it has to pass to the
// site and answers one it has already cached. so this reads whatever sucuri
// is holding: it comes back whole while the page is cached and 403s while it
// is not, and a fetch that fails leaves the companies from the last one that
// did.
//
// what warms that cache is a person opening the page, so whether this works on
// any given night is a question about the fund's traffic rather than about
// anything here. the fund's front page stays warm and is served to anyone, but
// it carries none of the companies, so there is nothing else to read. the 403
// says as much rather than showing a bare status, the way speedinvest's and
// blume's do — a red card here is the expected state, not a break.

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
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (resp.status === 403) {
		throw new Error(
			'okapi: refused this request (403) — sucuri answers only what it already holds, and the portfolio page had gone cold'
		);
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
