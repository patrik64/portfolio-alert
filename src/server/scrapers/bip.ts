import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.bipventures.vc';
const PAGE_URL = `${BASE_URL}/portfolio`;
const SITEMAP_URL = `${BASE_URL}/sitemap.xml`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BATCH_SIZE = 10;

// webflow. the grid says what the fund files each company under — the sector,
// the stage, and whether it still holds it — but stops at a hundred items,
// which is where a webflow collection stops without a pager. the fund is past
// that, so the last four alphabetically are on the site's own map and nowhere
// on the page. the map is what the list is taken from, and the grid only fills
// in what it knows.
//
// the grid links to a page per company, and it is that page rather than the
// grid that carries the company's own address, in a schema.org block the fund
// writes for it. the fund writes one for itself on every page too, so the one
// pointing back at the fund is passed over.

const SLUG = /<loc>https?:\/\/(?:www\.)?bipventures\.vc\/portfolio\/([a-z0-9-]+)<\/loc>/g;
const ITEM = /class="portfolio_list_grid_item--wrapper w-dyn-item"/g;
const PATH = /href="\/portfolio\/([a-z0-9-]+)"/;
const FIELD = (name: string) => new RegExp(`fs-cmsfilter-field="${name}"[^>]*>([^<]*)<`);
const SCHEMA = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
const TITLE = /<title>([^<]*)<\/title>/;
// the phase of a company the fund still holds
const HELD = /^active$/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a sector written with a comma in it would
// read as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const titleCase = (s: string) => s.replace(/^[a-z]/, (c) => c.toUpperCase());

interface Filed {
	name: string;
	sector: string;
	stage: string;
	phase: string;
}

async function fetchCompany(slug: string, filed?: Filed): Promise<ScrapedCompany | undefined> {
	const url = `${PAGE_URL}/${slug}`;
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) return undefined;
	const html = await resp.text();

	let named = '';
	let site = '';
	for (const m of html.matchAll(SCHEMA)) {
		try {
			const block = JSON.parse(m[1]) as { '@type'?: string; name?: string; url?: string };
			if (block['@type'] !== 'Organization' || !block.url) continue;
			if (/bipventures\.vc/i.test(block.url)) continue;
			named = clean(block.name ?? '');
			site = clean(block.url);
		} catch {
			// a block that will not parse is simply not the one being looked for
		}
	}

	// the page is titled "<company> — <city> | <sector> | BIP Ventures Portfolio"
	const parts = clean(html.match(TITLE)?.[1] ?? '').split('|');
	const name = filed?.name || named || clean(parts[0]?.split('—')[0] ?? '');
	if (!name) return undefined;

	const sector = filed?.sector || tag(parts.length > 2 ? parts[parts.length - 2] : '');
	const phase = filed?.phase ?? '';
	return {
		name,
		category: [sector, tag(filed?.stage ?? ''), HELD.test(phase) ? '' : titleCase(tag(phase))]
			.filter(Boolean)
			.join(', '),
		url: site
	};
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const [gridResp, mapResp] = await Promise.all([
		fetch(PAGE_URL, { headers: { 'User-Agent': UA } }),
		fetch(SITEMAP_URL, { headers: { 'User-Agent': UA } })
	]);
	if (!gridResp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${gridResp.status}`);
	}
	if (!mapResp.ok) {
		throw new Error(`Failed to fetch ${SITEMAP_URL}: ${mapResp.status}`);
	}
	const grid = await gridResp.text();
	const sitemap = await mapResp.text();

	const filed = new Map<string, Filed>();
	const starts = [...grid.matchAll(ITEM)].map((m) => m.index);
	for (const [i, at] of starts.entries()) {
		const item = grid.slice(at, starts[i + 1] ?? grid.length);
		const slug = item.match(PATH)?.[1];
		if (!slug) continue;
		filed.set(slug, {
			name: clean(item.match(FIELD('name'))?.[1] ?? ''),
			sector: tag(item.match(FIELD('sector'))?.[1] ?? ''),
			stage: clean(item.match(FIELD('stage'))?.[1] ?? ''),
			phase: clean(item.match(FIELD('phase'))?.[1] ?? '')
		});
	}

	const slugs = [...new Set([...sitemap.matchAll(SLUG)].map((m) => m[1]))];
	if (slugs.length === 0) {
		throw new Error('bip: the site map lists no companies');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (let i = 0; i < slugs.length; i += BATCH_SIZE) {
		const found = await Promise.all(
			slugs.slice(i, i + BATCH_SIZE).map((slug) => fetchCompany(slug, filed.get(slug)))
		);
		for (const company of found) {
			if (!company || seen.has(company.name.toLowerCase())) continue;
			seen.add(company.name.toLowerCase());
			companies.push(company);
		}
	}

	if (companies.length === 0) {
		throw new Error('bip: no companies behind the portfolio');
	}

	return companies;
}
