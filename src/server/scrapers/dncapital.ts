import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.dncapital.com';
const PAGE_URL = `${BASE_URL}/portfolio_fulllist.html`;
// the companies' pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a static site of its own: the full list is a grid of logo tiles, each
// linking a page per company by a bare slug, its hover text "Current" or
// "Exited", a ribbon "ACQUIRED" or "IPO" on some — an ipo alone does not
// make an exit here, five listed companies stayed current. nothing on the
// list names a company, so the pages are fetched: each heads with the name
// and sector, states a status, the date invested and a geography, and
// links the site. the tiles' hover text is the marking kept up: the
// status on a page lags it for a third of the exits, and the filter class
// on a tile lags both, so a company is exited when its tile or its page
// says so. a page that will not load leaves its company named off its
// slug, linking to that page; the oldest exits' pages link no site.

const TILE = /<a\b[^>]*\bhref="([^"#:/]+)"[^>]*class="white"[^>]*>\s*<li\b[^>]*class="mix\b[^"]*"[^>]*>([\s\S]*?)<\/li>/g;
const RIBBON = /class="ribbon2?\s+ribbon-top-right"[^>]*>\s*<span>([^<]*)<\/span>/;
const STANDING = /class="hvrbox-text">([^<]*)</;
const NAME = /<h1\b[^>]*>([\s\S]*?)<\/h1>\s*<h2\b[^>]*>([\s\S]*?)<\/h2>/;
const FACT = /<span class="blue">\s*([^<:]+):\s*<\/span>\s*([^<]*)/g;
const SITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*target="_blank"/;
const NOISE = /dncapital\.com|goldminemedia|twitter\.com|facebook\.com|linkedin\.com|atominvest/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// a name read off a slug, for a page that will not load: "auto1" is Auto1
const slugName = (slug: string) =>
	slug
		.split(/[-_]/)
		.filter(Boolean)
		.map((word) => word[0].toUpperCase() + word.slice(1))
		.join(' ');

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// a company's page, or nothing when it will not load
async function pageOf(url: string): Promise<string> {
	try {
		let resp = await fetch(url, { headers: { 'User-Agent': UA } });
		if (resp.status === 429) {
			await wait(20_000);
			resp = await fetch(url, { headers: { 'User-Agent': UA } });
		}
		return resp.ok ? await resp.text() : '';
	} catch {
		return '';
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const tiles = [...(await resp.text()).matchAll(TILE)].map(([, slug, tile]) => ({
		slug: unescape(slug),
		ribbon: clean(tile.match(RIBBON)?.[1] ?? ''),
		standing: clean(tile.match(STANDING)?.[1] ?? '')
	}));
	if (tiles.length === 0) {
		throw new Error('dncapital: no companies on the portfolio list');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [i, tile] of tiles.entries()) {
		if (i > 0) await wait(PACE_MS);
		const page = `${BASE_URL}/${tile.slug}`;
		const html = await pageOf(page);
		const [, heading, sector] = html.match(NAME) ?? [];
		const name = clean(heading ?? '') || slugName(tile.slug);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const facts = new Map([...html.matchAll(FACT)].map(([, label, value]) => [clean(label).toLowerCase(), clean(value)]));
		const status = facts.get('status') ?? '';
		const exited = /exited/i.test(tile.standing) || /\bexit/i.test(status);
		const year = facts.get('date invested')?.match(/\b(?:19|20)\d{2}\b/)?.[0];
		// "ACQUIRED" off the ribbon, and what a status adds: "Exit (PSG Equity)"
		const outcome = [
			tile.ribbon === 'IPO' ? 'IPO' : tile.ribbon.charAt(0) + tile.ribbon.slice(1).toLowerCase(),
			status.match(/\(([^)]+)\)/)?.[0] ?? ''
		]
			.filter(Boolean)
			.join(' ');
		const site = [...html.matchAll(new RegExp(SITE.source, 'g'))].map((m) => unescape(m[1])).find((u) => !NOISE.test(u));
		companies.push({
			name,
			category: [
				tag(sector ?? ''),
				tag(facts.get('geography') ?? ''),
				year ? `Invested ${year}` : '',
				outcome,
				exited ? 'Exited' : ''
			]
				.filter((t, k, all) => t && all.indexOf(t) === k)
				.join(', '),
			url: site || page
		});
	}

	return companies;
}
