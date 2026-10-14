import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.racap.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// craft with petite-vue: the portfolio page is a grid of tiles, the whole
// of it in the page, a tile a company named for screen readers and
// linking its page here. the page's filters are given each tile's facts as
// a list in the order of the tiles — its domain ("Healthcare", "Planetary
// Health"), its vertical ("Energy", "Agriculture & Food"), its status
// ("Current Private Investment", "IPO'd/Acquired") and the stage the fund
// came in at ("Series A", "NewCo") — and name each value in their options.
// the domain, the vertical, the stage and the status are kept as tags; a
// status of "IPO'd/Acquired" says the company went public or was sold, not
// that the fund is out of it, and is kept as written.
//
// a company's page adds its site and the year the fund invested, but the
// pages are slow — a second each — and two hundred and fifty of them run
// far past what a run may take, so they are not read: every company links
// its page here.

const SCOPE = /v-scope="PortfolioFilters\(([\s\S]*?)\)"/;
const OPTION = /<option value="([^"]+)">\s*([^<]*?)\s*<\/option>/g;
const TILE = /<article v-show="rowMatches\((\d+)\)"[^>]*>([\s\S]*?)<\/article>/g;
const NAME = /<h3 class="sr-only">\s*<div class="type-ui-2">([\s\S]*?)<\/div>/;
const HREF = /<a\s+href="([^"]*)"/;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

interface Row {
	domain?: string[];
	vertical?: string[];
	status?: string[];
	stage?: string[];
}

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) =>
	unescape(s.replace(/<[^>]+>/g, ' '))
		.replace(/[\s​]+/g, ' ')
		.trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// the json array opening at start, up to its close
function arrayAt(text: string, start: number): unknown {
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let i = start; i < text.length; i++) {
		const c = text[i];
		if (escaped) escaped = false;
		else if (c === '\\') escaped = true;
		else if (c === '"') inString = !inString;
		else if (!inString) {
			if (c === '[' || c === '{') depth++;
			else if ((c === ']' || c === '}') && --depth === 0) {
				try {
					return JSON.parse(text.slice(start, i + 1));
				} catch {
					return undefined;
				}
			}
		}
	}
	return undefined;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const scope = unescape(html.match(SCOPE)?.[1] ?? '');
	const at = scope.indexOf('[', scope.indexOf('rows'));
	const rows = at < 0 ? undefined : arrayAt(scope, at);
	if (!Array.isArray(rows) || rows.length === 0) {
		throw new Error("racapital: the page's filters carry no tiles' facts — the page moved");
	}
	const labels = new Map([...html.matchAll(OPTION)].map(([, value, label]) => [value, tag(label)]));
	const named = (values: string[] | undefined) => (values ?? []).map((value) => labels.get(value) ?? '');

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, index, tile] of html.matchAll(TILE)) {
		const name = clean(tile.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const row: Row = (rows as Row[])[Number(index)] ?? {};
		const href = unescape(tile.match(HREF)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [
				...named(row.domain),
				...named(row.vertical),
				...named(row.stage),
				...named(row.status)
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: href ? new URL(href, PAGE_URL).href : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('racapital: no companies in the portfolio grid — the markup moved');
	}
	return companies;
}
