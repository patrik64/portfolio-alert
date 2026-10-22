import type { ScrapedCompany } from './types';

const BASE_URL = 'https://borskifund.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a single-page app served pre-drawn: the portfolio page is a grid of tiles,
// the whole of it in the page, a tile a company named in its logo's alt
// text, with the domain it works in ("Health", "Climate Technology",
// "Future Society Technology") and an "Exit" badge on the ones the fund is
// out of; the page counts them ("21 companies"), and a grid holding fewer
// fails the run rather than pass for the whole. a tile opens a panel drawn
// from the site's script, which carries each company's site and a finer
// label ("Women's Health", "Deep Tech / Climate"); the script's address
// changes with every build and is read from the page. the domain and the
// label are kept as tags, an exit with the Exited tag.
//
// the site is a lovable project. on 2026-10-22 every address on the domain
// answered 404 with lovable's own "Project not found" page — the project
// unpublished or deleted, no other domain to be found — and the run says so
// rather than fail on a bare 404.

const TILE = /<button type="button" class="group relative aspect-\[4\/5\][^"]*"[^>]*>([\s\S]*?)<\/button>/g;
const NAME = /<img\b[^>]*\balt="([^"]*)"/;
const DOMAIN = /class="block text-\[10px\][^"]*">([^<]*)</;
const EXIT = />Exit<\/span>/;
const COUNT = />(\d+)(?:<!-- -->)?\s*(?:<!-- -->)?companies</;
const SCRIPT = /<script\b[^>]*\bsrc="(\/assets\/index-[^"]+\.js)"/;
// a company as the script writes it: {name:`Aiir`,sector:`…`,website:`…`,…}
const RECORD = /\{name:`([^`]*)`((?:,[\w$]+:(?:`[^`]*`|[\w$!.]+))*)\}/g;
const FIELD = /,([\w$]+):`([^`]*)`/g;
const GONE = /<title>Project not found<\/title>/;
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

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

// each company's fields as the site's script writes them, by name
async function recordsFor(html: string): Promise<Map<string, Record<string, string>>> {
	const script = html.match(SCRIPT)?.[1];
	if (!script) return new Map();
	const code = await fetchText(`${BASE_URL}${script}`);
	const records = new Map<string, Record<string, string>>();
	for (const [, name, rest] of code.matchAll(RECORD)) {
		const fields = Object.fromEntries([...rest.matchAll(FIELD)].map(([, key, value]) => [key, value]));
		if (fields.website !== undefined) records.set(clean(name).toLowerCase(), fields);
	}
	return records;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	const html = await resp.text();
	if (GONE.test(html)) {
		throw new Error("borski: lovable no longer serves the fund's site (\"Project not found\") — nothing to read until it is back");
	}
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const tiles = [...html.matchAll(TILE)].map(([, tile]) => tile);
	const counted = Number(html.match(COUNT)?.[1] ?? 0);
	if (tiles.length < counted) {
		throw new Error(`borski: the grid holds ${tiles.length} tiles of the ${counted} companies it counts`);
	}
	const records = await recordsFor(html);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const tile of tiles) {
		const name = clean(tile.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const record = records.get(name.toLowerCase()) ?? {};
		const site = clean(record.website ?? '');
		if (/^https?:\/\//i.test(site)) withSite++;
		companies.push({
			name,
			category: [
				tag(tile.match(DOMAIN)?.[1] ?? ''),
				tag(record.sublabel ?? ''),
				EXIT.test(tile) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('borski: no companies in the portfolio grid — the markup moved');
	}
	// without the script's records every company would link the page here
	if (withSite === 0) {
		throw new Error("borski: no company's site was found in the site's script — the script moved");
	}

	return companies;
}
