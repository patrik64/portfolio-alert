import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.overkill.vc';
const PAGE_URL = `${BASE_URL}/portfolio`;
const SITEMAP_URL = `${BASE_URL}/sitemap.xml`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BATCH_SIZE = 8;

// squarespace. the portfolio page is a wall of logos and nothing else — no
// names, and a third of the logos are not even linked — so reading it alone
// would leave a dozen companies with nothing to call them and nothing to point
// at.
//
// but the fund writes a page per company, and those pages carry the name it
// publishes, the country, and the company's own address. they are not linked
// from the wall, so they are found on the site map instead, and a page counts
// as a company when it opens with a name over a country. that is a shape the
// fund's other pages do not have.
//
// the wall is still read afterwards, for the few companies it links that have
// no page of their own. those are named by their address, since the fund
// prints no name for them anywhere.
//
// the wall is split under "Overkill Fund I" and "Overkill Fund II", which are
// the fund's own vehicles rather than anything about a company, so they are
// left out the way vehicles are elsewhere.

// a company page opens with the name, then the country, then the address —
// though a handful stop after the country, and one writes its link with the
// target attribute missing, so both are allowed for
const HEADER =
	/<h1[^>]*>\s*([^<>]+?)\s*<\/h1>\s*<p[^>]*>\s*([^<>|]{2,60})(?:\|\s*<a\s+href="(https?:\/\/[^"]+)")?/;
const LOC = /<loc>\s*(https?:\/\/[^<\s]+)\s*<\/loc>/g;
// the shop is the only part of the site deep enough to be worth skipping
const NOT_A_PAGE = /\/shop\//;
// a logo on the wall, linked to the company
const LOGO = /class="\s*sqs-block-image-link\s*"\s*href="(https?:\/\/[^"]+)"/g;
// one logo points at the company's page on the fund's own site rather than out
const OWN = /(^|\.)overkill\.vc$/i;

const un = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&mdash;/g, '—')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));

const clean = (s: string) => un(s).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a country written "Latvia, US" would read
// as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// the same brand written two ways — spaces, hyphens and capitals set aside
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const titled = (s: string) =>
	s === s.toLowerCase() ? s.replace(/\b[a-z]/g, (c) => c.toUpperCase()) : s;

const host = (url: string) => {
	try {
		const name = new URL(url).hostname.replace(/^www\./, '');
		return OWN.test(name) ? '' : (name.split('.')[0] ?? '');
	} catch {
		return '';
	}
};

// an address and a name are the same company when one runs into the other:
// getskinbliss.com is Skin Bliss, cadlab.io is CADLAB.io, my3d.cloud is
// My3Dcloud. four letters is short enough to keep a brand and long enough not
// to swallow an unrelated one
const SHORTEST = 4;
const same = (a: string, b: string) =>
	a.length >= SHORTEST && b.length >= SHORTEST && (a.includes(b) || b.includes(a));

async function get(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

async function fetchCompany(url: string): Promise<ScrapedCompany | null> {
	const found = (await get(url)).match(HEADER);
	if (!found) return null;

	const name = clean(found[1]);
	if (!name) return null;

	return { name, category: tag(found[2]), url: clean(found[3] ?? '') };
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const pages = [...(await get(SITEMAP_URL)).matchAll(LOC)]
		.map((m) => m[1])
		.filter((url) => !NOT_A_PAGE.test(url));
	if (pages.length === 0) {
		throw new Error('overkill: the site map lists no pages to look through');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (let i = 0; i < pages.length; i += BATCH_SIZE) {
		const found = await Promise.all(pages.slice(i, i + BATCH_SIZE).map(fetchCompany));
		for (const company of found) {
			if (!company || seen.has(company.name.toLowerCase())) continue;
			seen.add(company.name.toLowerCase());
			companies.push(company);
		}
	}

	// the wall of logos, for the addresses the company pages do not carry and
	// the few companies that have no page at all
	const wall = new Map<string, string>();
	for (const [, url] of (await get(PAGE_URL)).matchAll(LOGO)) {
		const brand = host(url);
		if (brand && !wall.has(key(brand))) wall.set(key(brand), url);
	}

	for (const company of companies) {
		const brand = [...wall.keys()].find((written) => same(written, key(company.name)));
		if (brand === undefined) continue;
		if (!company.url) company.url = wall.get(brand) ?? '';
		wall.delete(brand);
	}

	for (const url of wall.values()) {
		const name = titled(host(url));
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: '', url });
	}

	if (companies.length === 0) {
		throw new Error('overkill: no companies behind the portfolio');
	}

	return companies;
}
