import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.redseaventures.com';
const PAGE_URL = `${BASE_URL}/`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BATCH_SIZE = 10;

// squarespace. the fund's one page shows the portfolio as a wall of logos with
// no captions and no alt text, but every logo links to a page of the company's
// own on the fund's site, and that page has the name in its title, a line
// about the company, and a link to it. those are fetched in batches.
//
// a third of the logos are linked with the full address rather than a path,
// which is the same page reached two ways, so the paths are reduced before
// anything is fetched.
//
// half the pages carry a word for how the investment stands. only "acquired"
// says anything — "active" is every company the fund still holds — so that is
// the one kept.

const SLIDE = /<a href="([^"]*)" aria-label="[^"]*" class=" image-slide-anchor/g;
const TITLE = /<title[^>]*>([\s\S]*?)<\/title>/;
const STATUS = /<h2[^>]*>\s*([A-Za-z ]+?)\s*<\/h2>/;
const LINK = /href="(https?:\/\/[^"]+)"/g;
// the fund's own pages, the fonts every squarespace page loads, and where it
// writes
const NOT_THE_COMPANY =
	/redseaventures|squarespace|sqspcdn|typekit|w3\.org|facebook|twitter|instagram|linkedin|medium\.com/i;
// what the fund suffixes every page title with
const SUFFIX = /\s*(?:—|&mdash;|-)\s*Red Sea Ventures\s*$/i;
// the status of a company the fund still holds
const HELD = /^active$/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

// the fund shouts the status; the rest of the app does not
const sentence = (s: string) =>
	s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = (await fetchText(PAGE_URL)).replace(/\s+/g, ' ');

	const paths: string[] = [];
	for (const m of html.matchAll(SLIDE)) {
		const path = m[1].replace(BASE_URL, '').replace('http://www.redseaventures.com', '');
		if (path.startsWith('/') && !paths.includes(path)) paths.push(path);
	}

	if (paths.length === 0) {
		throw new Error('redsea: no companies on the portfolio page');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (let i = 0; i < paths.length; i += BATCH_SIZE) {
		const batch = paths.slice(i, i + BATCH_SIZE);
		const pages = await Promise.all(
			batch.map((p) => fetchText(`${BASE_URL}${p}`).catch(() => ''))
		);
		for (const page of pages) {
			const flat = page.replace(/\s+/g, ' ');
			const name = clean(flat.match(TITLE)?.[1]?.replace(SUFFIX, '') ?? '');
			if (!name || seen.has(name)) continue;
			seen.add(name);

			const status = clean(flat.match(STATUS)?.[1] ?? '');
			companies.push({
				name,
				category: status && !HELD.test(status) ? sentence(status) : '',
				url: clean(
					[...flat.matchAll(LINK)].map((m) => m[1]).find((u) => !NOT_THE_COMPANY.test(u)) ?? ''
				)
			});
		}
	}

	return companies;
}
