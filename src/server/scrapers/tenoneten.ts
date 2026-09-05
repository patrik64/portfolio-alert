import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.tenoneten.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
const SITEMAP_URL = `${BASE_URL}/sitemap.xml`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BATCH_SIZE = 10;

// webflow with no pagination control, which quietly costs the fund the tail of
// its own portfolio: the list stops at webflow's hundredth item, alphabetically,
// so every company from V onward is missing from the page. the sitemap knows
// them, and their own pages name them — so the page supplies the hundred it
// shows and the sitemap the rest.
//
// the cards link only to those pages, never to the company; the company's own
// address is on the page, first among the links that leave the site.

const ITEM = 'class="portfolio-ci w-dyn-item"';
const NAME = /<h3 class="heading-3 mobile-heading">([^<]*)<\/h3>/;
const SLUG = /href="\/portfolio\/([^"]+)"/;
const LOC = /<loc>[^<]*\/portfolio\/([^<]+)<\/loc>/g;
const TITLE = /<title>([^<]*)<\/title>/;
const NOT_THE_COMPANY =
	/tenoneten|website-files|webflow|google\.|fonts\.|twitter\.com|linkedin\.com|facebook\.com|bloomberg\.com|techcrunch\.com|forbes\.com|wsj\.com/i;

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const [html, sitemap] = await Promise.all([fetchText(PAGE_URL), fetchText(SITEMAP_URL)]);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	const listed = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const name = (item.match(NAME)?.[1] ?? '').trim();
		const slug = item.match(SLUG)?.[1] ?? '';
		if (slug) listed.add(slug);
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({ name, category: '', url: slug ? `${PAGE_URL}/${slug}` : '' });
	}
	if (companies.length === 0) {
		throw new Error('tenoneten: no companies on the portfolio page');
	}

	// the companies the hundred-item limit cut off
	const missing = [...new Set([...sitemap.matchAll(LOC)].map((m) => m[1]))].filter(
		(slug) => !listed.has(slug)
	);

	for (let i = 0; i < missing.length; i += BATCH_SIZE) {
		const batch = missing.slice(i, i + BATCH_SIZE);
		const pages = await Promise.all(
			batch.map((slug) => fetchText(`${PAGE_URL}/${slug}`).catch(() => ''))
		);
		for (let j = 0; j < batch.length; j++) {
			const page = pages[j];
			// the fund's own name follows the company's in the title
			const name = (page.match(TITLE)?.[1] ?? '').split('—')[0].trim();
			// a page that would not load names nobody; its company keeps the row
			// an earlier fetch gave it rather than being renamed to its slug
			if (!name || seen.has(name)) continue;
			seen.add(name);
			companies.push({ name, category: '', url: `${PAGE_URL}/${batch[j]}` });
		}
	}

	return companies;
}
