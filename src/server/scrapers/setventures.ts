import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://setventures.com/portfolio/';
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
// no company page is begun past this, leaving the run its time
const DEADLINE_MS = 150_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the companies page is two grids of tiles, the portfolio and
// the exits, each holding up to fifty and loading more past that, a tile a
// company linking its page here, with its logo named for it in capitals
// ("INSTAGRID"), its sector ("Distributed Energy Systems") or "Exits", and
// its country. a company's page is titled with its name as the fund keeps
// it ("Instagrid", "sonnen"), taken where it spells the same name, and
// links its site ("Visit Instagrid"). the sector and the country are kept
// as tags, an exit with the Exited tag. a grid as full as its first page
// would hide a further one, and fails the run rather than pass for the
// whole; a company page that will not load, or is not reached by the
// deadline, leaves its company named in capitals and linking it.

const GRID = /(?=<div class='nectar-post-grid-wrap\b)/;
const PER_PAGE = /data-query='[^']*"posts_per_page":"(\d+)"/;
const TILE = /(?=<div class="nectar-post-grid-item\b[^"]*" data-post-id=)/;
const PAGE = /<a\s+class="nectar-post-grid-link\b[^>]*?\bhref="([^"]*)"[^>]*?(?:\baria-label="([^"]*)")?[^>]*>/;
const LOGO = /<img\b[^>]*class="portfolio-grid-logo"[^>]*\balt="([^"]*)"/;
const SECTOR = /<span class="meta-category">([\s\S]*?)<\/span>/;
const COUNTRY = /<span class="meta-excerpt">([\s\S]*?)<\/span>/;
const TITLE = /<title>\s*([^<|]*?)\s*(?:\|[^<]*)?<\/title>/;
const SITE = /<a\s+class="nectar-button\b[^>]*\bhref="([^"]*)"[^>]*>\s*<span>\s*Visit\b/;
const EXIT = /^exits?$/i;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// a page, or a refusal waited out once
async function get(url: string): Promise<Response> {
	const headers = { 'User-Agent': UA };
	const resp = await fetch(url, { headers });
	if (resp.status !== 429) return resp;
	await resp.body?.cancel();
	await wait(REFUSED_MS);
	return fetch(url, { headers });
}

// a company page's title and site, or nothing when it will not load
async function detailsOf(href: string): Promise<{ title: string; site: string }> {
	try {
		const resp = await get(href);
		if (!resp.ok) {
			await resp.body?.cancel();
			return { title: '', site: '' };
		}
		const html = await resp.text();
		const site = unescape(html.match(SITE)?.[1] ?? '').trim();
		return { title: clean(html.match(TITLE)?.[1] ?? ''), site: /^https?:\/\//i.test(site) ? site : '' };
	} catch {
		return { title: '', site: '' };
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const started = Date.now();
	const resp = await get(PAGE_URL);
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	// every grid's tiles; a grid as full as a page may have more behind its button
	const tiles: string[] = [];
	for (const grid of html.split(GRID).slice(1)) {
		const shown = grid.split(TILE).slice(1);
		const perPage = Number(grid.match(PER_PAGE)?.[1] ?? 0);
		if (perPage > 0 && shown.length >= perPage) {
			throw new Error(
				`setventures: a grid shows ${shown.length} of its ${perPage} a page — more lie behind "Load More"`
			);
		}
		tiles.push(...shown);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const tile of tiles) {
		const page = tile.match(PAGE);
		const written = clean(tile.match(LOGO)?.[1] || page?.[2] || '');
		if (!written || STEALTH.test(written) || seen.has(written.toLowerCase())) continue;
		seen.add(written.toLowerCase());
		const href = unescape(page?.[1] ?? '').trim();
		const reached = /^https?:\/\//i.test(href) && Date.now() - started < DEADLINE_MS;
		if (reached && companies.length > 0) await wait(PACE_MS);
		const { title, site } = reached ? await detailsOf(href) : { title: '', site: '' };
		if (site) withSite++;
		// the page's own spelling of the tile's name, never another name
		const name = title.toLowerCase() === written.toLowerCase() ? title : written;
		const sector = clean(tile.match(SECTOR)?.[1] ?? '');
		companies.push({
			name,
			category: [
				EXIT.test(sector) ? '' : tag(sector),
				tag(tile.match(COUNTRY)?.[1] ?? ''),
				EXIT.test(sector) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: site || href || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('setventures: no companies in the portfolio grids — the markup moved');
	}
	// without the company pages every company would link its page here
	if (withSite === 0) {
		throw new Error("setventures: no company page gave its site — the pages' markup moved");
	}

	return companies;
}
