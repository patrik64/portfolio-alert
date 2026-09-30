import type { ScrapedCompany } from './types';

const BASE_URL = 'https://correlationvc.com';
const PAGE_URL = `${BASE_URL}/companies/`;
const AJAX_URL = `${BASE_URL}/wp-admin/admin-ajax.php`;
// the further pages of the list are asked for one at a time, a pause
// between them; the companies' panels three at a time, as two hundred and
// fifty of them asked one after another would outlast the four minutes a
// fund gets. a refusal is waited out once
const PACE_MS = 150;
const BATCH_SIZE = 3;
const RETRY_DELAY_MS = 20_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, a theme of its own: the companies page shows twenty tiles — a
// logo, the name, the category it is filed under and a flag on the ones
// that went public or were bought ("ipo", "acquired") — and scrolls the
// rest in through admin-ajax, a page at a time on the query the page hands
// its script; the archive's own second page is a broken address. a tile
// opens a panel, fetched the same way by the company's number, that tells
// its sector, where it is headquartered and its site. a page of the list
// that will not come fails the run, rather than take a part of the list
// for the whole; a panel that will not leaves its company with what its
// tile says, linking to the companies page — three of them answer with the
// site's own error, to anyone who asks. the link of a company bought is
// sometimes its buyer's, as the fund has it.

const VARS = /\bdata-queryvars='([^']*)'/;
const CELL = '<div class="[ l-CompanyArchive__cell ]';
const NUMBER = /\bdata-company="(\d+)"/;
const NAME = /l-CompanyArchive__name\b[^>]*>([\s\S]*?)<\/p>/;
const FLAG = /l-CompanyArchive__label\b[^>]*>([\s\S]*?)<\/span>/;
const FILED = /l-CompanyArchive__term\b[^>]*>([\s\S]*?)<\/a>/;
// a fact of the panel, its heading and what it says
const FACT = /l-CompanySingle__sub-header\b[^>]*>([\s\S]*?)<\/p>\s*<p\b[^>]*>([\s\S]*?)<\/p>/g;
const SITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*\bclass="\[ l-CompanySingle__links\b/;
const STEALTH = /^stealth\b/i;

interface Vars {
	posts?: string;
	current_page?: number;
	max_page?: number;
}

interface Tile {
	number: string;
	name: string;
	flag: string;
	filed: string;
}

interface Panel {
	sectors: string[];
	place: string;
	site: string;
}

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a place written "Palo Alto, CA" would read
// as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// what admin-ajax answers to a form the page's script would send
async function post(form: Record<string, string>): Promise<Response> {
	const ask = () =>
		fetch(AJAX_URL, {
			method: 'POST',
			headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams(form).toString()
		});
	let resp = await ask();
	if (resp.status === 429) {
		await wait(RETRY_DELAY_MS);
		resp = await ask();
	}
	return resp;
}

// the tiles in a page of the list; what admin-ajax sends begins with one
const tilesIn = (html: string): Tile[] =>
	html
		.split(CELL)
		.slice(1)
		.map((cell) => ({
			number: cell.match(NUMBER)?.[1] ?? '',
			name: clean(cell.match(NAME)?.[1] ?? ''),
			flag: clean(cell.match(FLAG)?.[1] ?? ''),
			filed: tag(cell.match(FILED)?.[1] ?? '')
		}));

// what a company's panel says, or nothing when it will not come
async function panelOf(number: string): Promise<Panel | null> {
	if (!number) return null;
	try {
		const resp = await post({ action: 'get_company_data', get_company_data: number });
		if (!resp.ok) return null;
		const html = await resp.text();
		const facts = new Map([...html.matchAll(FACT)].map(([, heading, value]) => [clean(heading).toLowerCase(), value]));
		return {
			// "Artificial Intelligence, Software" is two sectors
			sectors: clean(facts.get('sector') ?? '')
				.split(/\s*,\s*/)
				.filter(Boolean),
			place: tag(facts.get('headquartered') ?? ''),
			site: unescape(html.match(SITE)?.[1] ?? '').trim()
		};
	} catch {
		return null;
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const tiles = tilesIn(html);
	if (tiles.length === 0) {
		throw new Error('correlation: no companies on the companies page');
	}

	// the rest of the list, as the page's script scrolls it in: it sends the
	// page it is on and is given the one after
	const vars = JSON.parse(unescape(html.match(VARS)?.[1] ?? '{}')) as Vars;
	const last = Number(vars.max_page ?? 1);
	if (last > 1 && !vars.posts) {
		throw new Error('correlation: the companies page hands its script no query to page on');
	}
	for (let page = Number(vars.current_page ?? 1); page < last && page < 100; page++) {
		await wait(PACE_MS);
		const more = await post({
			action: 'load_more_company_data',
			query: vars.posts ?? '',
			page: String(page),
			max_pages: String(last)
		});
		if (!more.ok) {
			throw new Error(`Failed to fetch page ${page + 1} of the companies from ${AJAX_URL}: ${more.status}`);
		}
		const further = tilesIn(await more.text());
		if (further.length === 0) break;
		tiles.push(...further);
	}

	const listed: Tile[] = [];
	const seen = new Set<string>();
	for (const tile of tiles) {
		if (!tile.name || STEALTH.test(tile.name) || seen.has(tile.name.toLowerCase())) continue;
		seen.add(tile.name.toLowerCase());
		listed.push(tile);
	}

	const companies: ScrapedCompany[] = [];
	for (let i = 0; i < listed.length; i += BATCH_SIZE) {
		const batch = listed.slice(i, i + BATCH_SIZE);
		const panels = await Promise.all(batch.map((tile) => panelOf(tile.number)));
		batch.forEach((tile, j) => {
			const panel = panels[j];
			// "ipo" and "acquired", as the flag has them
			const outcome = /^ipo$/i.test(tile.flag) ? 'IPO' : tile.flag.charAt(0).toUpperCase() + tile.flag.slice(1);
			companies.push({
				name: tile.name,
				category: [tile.filed, ...(panel?.sectors ?? []), panel?.place ?? '', outcome, outcome ? 'Exited' : '']
					.filter((t, k, all) => t && all.indexOf(t) === k)
					.join(', '),
				url: panel?.site || PAGE_URL
			});
		});
	}

	return companies;
}
