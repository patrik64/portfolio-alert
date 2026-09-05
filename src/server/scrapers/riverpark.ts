import type { ScrapedCompany } from './types';

const BASE_URL = 'https://riverparkvc.com';
const PAGE_URL = `${BASE_URL}/portfolio/`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BATCH_SIZE = 10;

// wordpress with a cube-portfolio grid. each tile names the company in its
// caption and carries the fund's sector slugs in its class list; the filter
// buttons above the grid spell those slugs out, so the labels come from the
// page itself rather than being guessed at. "all" is the filter that shows
// everything, not a sector.
//
// the tiles link to the fund's own write-ups, and the company's address is on
// those — the first link leaving the site, ahead of the twitter and wellfound
// links some of them add. each is sixteen kilobytes, so they are fetched in
// batches.

const ITEM =
	/<div class="cbp-item ([^"]*)"[\s\S]{0,900}?<a href="([^"]*)"[\s\S]{0,900}?<div class="cbp-l-caption-title">([^<]*)<\/div>/g;
const FILTER = /data-filter="\.([a-z0-9-]+)" class="cbp-filter-item"[^>]*>([^<]*)</g;
const LINK = /href="(https?:\/\/[^"]+)"/g;
// the fund's own pages and the furniture every wordpress page carries
const NOT_THE_COMPANY =
	/riverparkvc|w3\.org|gmpg\.org|wordpress|google|gstatic|facebook\.com\/RiverPark|twitter\.com\/riverpark/i;
// the filter that shows everything says nothing about a company
const SHOW_ALL = 'all';

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await fetchText(PAGE_URL);

	const labels = new Map(
		[...html.matchAll(FILTER)].map((m) => [m[1], clean(m[2])] as [string, string])
	);

	const listed: { name: string; category: string; page: string }[] = [];
	const seen = new Set<string>();
	for (const m of html.matchAll(ITEM)) {
		const name = clean(m[3]);
		if (!name || seen.has(name)) continue;
		seen.add(name);
		listed.push({
			name,
			category: m[1]
				.split(/\s+/)
				.filter((s) => s !== SHOW_ALL && labels.has(s))
				.map((s) => labels.get(s) as string)
				.join(', '),
			page: m[2]
		});
	}

	if (listed.length === 0) {
		throw new Error('riverpark: no companies on the portfolio page');
	}

	const companies: ScrapedCompany[] = listed.map((c) => ({
		name: c.name,
		category: c.category,
		url: ''
	}));

	for (let i = 0; i < listed.length; i += BATCH_SIZE) {
		const batch = listed.slice(i, i + BATCH_SIZE);
		const pages = await Promise.all(
			batch.map((c) =>
				c.page ? fetchText(`${BASE_URL}${c.page}`).catch(() => '') : Promise.resolve('')
			)
		);
		pages.forEach((page, j) => {
			const off = [...page.matchAll(LINK)]
				.map((m) => m[1])
				.find((u) => !NOT_THE_COMPANY.test(u));
			companies[i + j].url = off ?? '';
		});
	}

	return companies;
}
