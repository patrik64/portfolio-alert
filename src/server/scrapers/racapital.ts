import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.racap.com/portfolio';
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
// no company page is begun past this, leaving the run its time
const DEADLINE_MS = 150_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// craft with petite-vue: the portfolio page is a grid of tiles, the whole
// of it in the page, a tile a company named for screen readers and
// linking its page here. the page's filters are given each tile's facts as
// a list in the order of the tiles — its domain ("Healthcare", "Planetary
// Health"), its vertical ("Energy", "Agriculture & Food"), its status
// ("Current Private Investment", "IPO'd/Acquired") and the stage the fund
// came in at ("Series A", "NewCo") — and name each value in their options.
// a company's page adds its site and the year the fund invested. the
// domain, the vertical, the stage, the status and the year are kept as
// tags; a status of "IPO'd/Acquired" says the company went public or was
// sold, not that the fund is out of it, and is kept as written. a company
// page that will not load, or is not reached by the deadline, leaves its
// company linking it.

const SCOPE = /v-scope="PortfolioFilters\(([\s\S]*?)\)"/;
const OPTION = /<option value="([^"]+)">\s*([^<]*?)\s*<\/option>/g;
const TILE = /<article v-show="rowMatches\((\d+)\)"[^>]*>([\s\S]*?)<\/article>/g;
const NAME = /<h3 class="sr-only">\s*<div class="type-ui-2">([\s\S]*?)<\/div>/;
const HREF = /<a\s+href="([^"]*)"/;
const SITE = /<a\s+href="([^"]*)"[^>]*>\s*<span>Website<\/span>/;
const FACT = (label: string) =>
	new RegExp(`<dt\\b[^>]*>${label}</dt>\\s*<dd\\b[^>]*>([\\s\\S]*?)</dd>`, 'i');
const YEAR = /\b(?:19|20)\d{2}\b/;
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

// a company page's site and the year the fund invested, or nothing when it will not load
async function detailsOf(href: string): Promise<{ site: string; year?: string }> {
	try {
		const resp = await get(href);
		if (!resp.ok) {
			await resp.body?.cancel();
			return { site: '' };
		}
		const html = await resp.text();
		const site = unescape(html.match(SITE)?.[1] ?? '').trim();
		return {
			site: /^https?:\/\//i.test(site) ? site : '',
			year: clean(html.match(FACT('Initial Investment Year'))?.[1] ?? '').match(YEAR)?.[0]
		};
	} catch {
		return { site: '' };
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const started = Date.now();
	const resp = await get(PAGE_URL);
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
	let withSite = 0;
	for (const [, index, tile] of html.matchAll(TILE)) {
		const name = clean(tile.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const row: Row = (rows as Row[])[Number(index)] ?? {};
		const href = unescape(tile.match(HREF)?.[1] ?? '').trim();
		const reached = /^https?:\/\//i.test(href) && Date.now() - started < DEADLINE_MS;
		if (reached && companies.length > 0) await wait(PACE_MS);
		const { site, year } = reached ? await detailsOf(href) : { site: '', year: undefined };
		if (site) withSite++;
		companies.push({
			name,
			category: [
				...named(row.domain),
				...named(row.vertical),
				...named(row.stage),
				...named(row.status),
				year ? `Invested ${year}` : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: site || href || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('racapital: no companies in the portfolio grid — the markup moved');
	}
	// without the company pages every company would link its page here
	if (withSite === 0) {
		throw new Error("racapital: no company page gave its site — the pages' markup moved");
	}

	return companies;
}
