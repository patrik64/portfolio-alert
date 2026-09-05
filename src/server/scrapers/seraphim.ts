import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://seraphim.vc/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BATCH_SIZE = 10;

// wordpress. the page opens with the fund's top ten holdings and then lists
// the whole portfolio, so those ten appear twice and only the first is kept.
//
// each tile carries a class saying how the fund is involved. two of those are
// the vehicles the cheque came from and say nothing about the company; the
// third, space_camp, is the fund's accelerator, which is a different sort of
// relationship and is recorded.
//
// where a tile leads depends on which of those it is. the accelerator's tiles
// link straight to the company, and those are addresses already; the fund's own
// link to a write-up on seraphim.vc, and only those are fetched, for the
// address behind their "Visit Website" button.

const ITEM =
	/<div class="col-12 col-md-4 ([a-z_ ]*)">\s*<a href="([^"]*)"[\s\S]{0,1200}?<div class="info">\s*<p>\s*([^<]*?)\s*<\/p>/g;
const WEBSITE = /<a class="button-main[^"]*" href="(https?:\/\/[^"]+)"[^>]*>[\s\S]{0,200}?Visit Website/;
const ACCELERATOR = /\bspace_camp\b/;
const OWN_SITE = /^https?:\/\/(?:www\.)?seraphim\.vc\//i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&amp;/g, '&')
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

	const listed: { name: string; page: string; accelerator: boolean }[] = [];
	const seen = new Set<string>();
	for (const m of html.matchAll(ITEM)) {
		const name = clean(m[3]);
		if (!name || seen.has(name)) continue;
		seen.add(name);
		listed.push({ name, page: m[2], accelerator: ACCELERATOR.test(m[1]) });
	}

	if (listed.length === 0) {
		throw new Error('seraphim: no companies on the portfolio page');
	}

	const companies: ScrapedCompany[] = listed.map((c) => ({
		name: c.name,
		category: c.accelerator ? 'Space Camp' : '',
		url: OWN_SITE.test(c.page) ? '' : c.page
	}));

	const writeUps = listed
		.map((c, at) => ({ ...c, at }))
		.filter((c) => OWN_SITE.test(c.page));
	for (let i = 0; i < writeUps.length; i += BATCH_SIZE) {
		const batch = writeUps.slice(i, i + BATCH_SIZE);
		const pages = await Promise.all(batch.map((c) => fetchText(c.page).catch(() => '')));
		pages.forEach((page, j) => {
			companies[batch[j].at].url = page.match(WEBSITE)?.[1] ?? '';
		});
	}

	return companies;
}
