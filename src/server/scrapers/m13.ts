import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.m13.co/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MAX_PAGES = 40;

// webflow, sixteen companies to a page, each following the one before by the
// link at the foot of the list.
//
// a company carries its own fields written out beside the tags it is shown
// with — the sector it is filed under, whether it is still held, and the round
// the fund came in at. the round is the shape of the investment rather than
// anything about the company, so it is left out; Current, which is what the
// fund says of a company it still holds, is the ordinary case and is left out
// too, and Exited is kept in the fund's word.
//
// the fund publishes no address for a company anywhere on the page, so the
// link is left empty. the handful of companies shown again at the top of the
// page under Recent investments are all in the list below it, so only the list
// is read.

const ITEM = /(?=<div[^>]*\bclass="c-port-item w-dyn-item")/;
const NAME = /fs-list-field="name"[^>]*>([\s\S]*?)<\/h2>/;
const FIELD = (name: string) => new RegExp(`fs-list-field="${name}"[^>]*>([^<]*)<`, 'g');
const NEXT = /<a\b[^>]*?\bhref="([^"]*)"[^>]*class="[^"]*w-pagination-next/;
// what the fund says of a company it still holds
const HELD = 'Current';

const clean = (s: string) =>
	s
		.replace(/<[^>]+>/g, ' ')
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;|&#8220;|&#8221;/g, '"')
		.replace(/&nbsp;| /g, ' ')
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

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

	let next: string | undefined = PAGE_URL;
	for (let page = 0; next && page < MAX_PAGES; page++) {
		const at: string = next;
		const html = await fetchText(at);

		for (const item of html.split(ITEM).slice(1)) {
			const name = clean(item.match(NAME)?.[1] ?? '');
			if (!name || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());

			const said = (field: string) =>
				[...item.matchAll(FIELD(field))].map((found) => clean(found[1])).filter(Boolean);

			companies.push({
				name,
				category: [...said('sector'), ...said('status').filter((state) => state !== HELD)].join(
					', '
				),
				url: ''
			});
		}

		const link = html.match(NEXT)?.[1];
		next = link ? new URL(link, at).href : undefined;
	}

	if (companies.length === 0) {
		throw new Error('m13: no companies in the portfolio');
	}

	return companies;
}
