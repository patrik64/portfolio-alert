import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.rainfall.com';
const PAGE_URL = `${BASE_URL}/`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BATCH_SIZE = 10;

// static webflow on the fund's one page. a row gives the company's name, the
// town and country it works from, the year the fund came in, a link to it, and
// a note on how the investment ended — the fund writes those out in full,
// naming who bought the company or the ticker it listed under.
//
// the sector is not in the row: finsweet's cms nest leaves an empty slot there
// and fills it in the browser from the company's own page. those pages are
// stubs of a few kilobytes holding just the categories, so they are fetched in
// batches rather than the sector being left out.
//
// four rows are companies in stealth, described by what they do rather than
// named. they carry a different class from the rest, which is what tells them
// apart, and they are left out until the fund says who they are.

const ITEM = 'role="listitem" class="_9-col cc-portfolio-item w-dyn-item">';
// a company still in stealth is written with a "smaller" tag and no name
const NAME = /stagger-link-text="" class="tag portfolio">([^<]*)</;
const SLUG = /href="(\/portfolio-companies\/[^"]*)"/;
const LOCATION = /class="c-hide-landscape"><div class="mono cc-30">([^<]*)</;
const COUNTRY = /class="c-hidden-country">([^<]*)</;
const NOTE = /class="mono cc-portfolio-note">([^<]*)</;
const SITE = /<a href="(https?:\/\/[^"]*)"[^>]*class="link-absolute/;
const CATEGORY = /<div r-indexed="category">([^<]*)</g;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a town written "San Francisco, CA" would
// read as two tags rather than one place
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = (await fetchText(PAGE_URL)).replace(/\s+/g, ' ');

	const listed: { name: string; where: string[]; note: string; url: string; page: string }[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const name = clean(item.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name)) continue;
		seen.add(name);
		listed.push({
			name,
			where: [tag(item.match(LOCATION)?.[1] ?? ''), tag(item.match(COUNTRY)?.[1] ?? '')].filter(
				Boolean
			),
			note: tag(item.match(NOTE)?.[1] ?? ''),
			url: item.match(SITE)?.[1] ?? '',
			page: item.match(SLUG)?.[1] ?? ''
		});
	}

	if (listed.length === 0) {
		throw new Error('rainfall: no companies on the portfolio page');
	}

	const companies: ScrapedCompany[] = [];
	for (let i = 0; i < listed.length; i += BATCH_SIZE) {
		const batch = listed.slice(i, i + BATCH_SIZE);
		const pages = await Promise.all(
			batch.map((c) => (c.page ? fetchText(`${BASE_URL}${c.page}`).catch(() => '') : ''))
		);
		batch.forEach((c, j) => {
			const sectors = [...pages[j].matchAll(CATEGORY)].map((m) => clean(m[1])).filter(Boolean);
			companies.push({
				name: c.name,
				category: [...sectors, ...c.where, c.note].filter(Boolean).join(', '),
				url: c.url
			});
		});
	}

	return companies;
}
