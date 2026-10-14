import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.indicocapital.com';
const PAGE_URL = `${BASE_URL}/our-companies`;
const MAX_PAGES = 40;
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
// no company page is begun past this, leaving the run its time
const DEADLINE_MS = 150_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the companies page is a grid of cards, eighteen a page
// (?1c34cda7_page=2), a card a company linking its page here, with its
// name, the year the fund invested, a line about it, the fund's themes it
// falls under ("Technology", "Sustainability") and a badge where the fund
// is out of it ("Past", "RIP") or where the partners backed it before the
// fund ("Pre-Indico"). below the grid, "Other Unicorns we participated
// in!" is the partners' record at other firms, not the fund's, and is left
// out, as is a card marked pre-indico. a company's page adds its sector,
// its headquarters, its status ("Active") and its site. the themes, the
// sector, the place and the year are kept as tags, an exit with the Exited
// tag and a company no longer running with the Closed tag. every page of
// the grid must load; a company page that will not, or is not reached by
// the deadline, leaves its company linking it.

const CARD =
	/<div role="listitem" class="mob-full w-dyn-item"><a href="([^"]*)" class="work-card\b[^"]*">([\s\S]*?)<\/a><\/div>/g;
const NAME = /fs-cmsfilter-field="name"[^>]*>([^<]*)</;
const YEAR = /fs-cmsfilter-field="year"[^>]*>\s*((?:19|20)\d{2})/;
const THEME = /fs-cmsfilter-field="category" class="hidden-attribute">([^<]*)</g;
// a badge the card shows: the condition hides the others
const BADGE = /<div class="company-category-wrapper ([\w-]+)">([\s\S]*?)<\/div>/g;
const NEXT = /href="(\?\w+_page=\d+)"[^>]*class="w-pagination-next\b/;
const FACT = (label: string) =>
	new RegExp(`>${label}</div>\\s*<div class="text-color-midnightblue text-weight-bold">([^<]*)<`);
const SITE = />Website<\/div>\s*<a href="([^"]*)"/;
const NESTED = (name: string) => new RegExp(`fs-cmsnest-collection="${name}"[^>]*>([\\s\\S]*?)</div></div>`);
const LINK_TEXT = /<a\b[^>]*>([^<]*)<\/a>/g;
const PRE = /^pre-indico$/i;
const PAST = /^(?:past|exited)$/i;
const RIP = /^rip$/i;
const EXITED = /\bexit/i;
const CLOSED = /^(?:rip|past portfolio|closed|inactive)$/i;
const UNSAID = /^(?:-|other|others|all|n\/a|active)$/i;
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

interface Details {
	site: string;
	place: string;
	status: string;
	sectors: string[];
	stages: string[];
}

const NONE: Details = { site: '', place: '', status: '', sectors: [], stages: [] };

// a company page's site and facts, or nothing when it will not load
async function detailsOf(href: string): Promise<Details> {
	try {
		const resp = await get(href);
		if (!resp.ok) {
			await resp.body?.cancel();
			return NONE;
		}
		const html = await resp.text();
		const nested = (name: string) =>
			[...(html.match(NESTED(name))?.[1] ?? '').matchAll(LINK_TEXT)].map(([, text]) => clean(text));
		const site = unescape(html.match(SITE)?.[1] ?? '').trim();
		return {
			site: /^https?:\/\//i.test(site) ? site : '',
			place: clean(html.match(FACT('Headquarters'))?.[1] ?? ''),
			status: clean(html.match(FACT('Status'))?.[1] ?? ''),
			sectors: nested('sector'),
			stages: nested('stage')
		};
	} catch {
		return NONE;
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const started = Date.now();

	// the whole grid, a page at a time; a part of it must not pass for the whole
	const cards: { path: string; card: string }[] = [];
	for (let path: string | undefined = '', page = 0; path !== undefined && page < MAX_PAGES; page++) {
		const url: string = `${PAGE_URL}${path}`;
		const resp: Response = await get(url);
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${url}: ${resp.status}`);
		}
		const html: string = await resp.text();
		cards.push(...[...html.matchAll(CARD)].map(([, href, card]) => ({ path: href, card })));
		path = html.match(NEXT)?.[1];
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const { path, card } of cards) {
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		const badges = [...card.matchAll(BADGE)].map(([, kind, text]) => clean(text) || kind);
		if (badges.some((badge) => PRE.test(badge))) continue;
		seen.add(name.toLowerCase());
		const href = new URL(unescape(path), BASE_URL).href;
		const reached = Date.now() - started < DEADLINE_MS;
		if (reached && companies.length > 0) await wait(PACE_MS);
		const details = reached ? await detailsOf(href) : NONE;
		if (details.site) withSite++;
		const said = [details.status, ...details.stages];
		const closed = badges.some((badge) => RIP.test(badge)) || said.some((s) => CLOSED.test(s));
		const exited =
			!closed && (badges.some((badge) => PAST.test(badge)) || said.some((s) => EXITED.test(s) && !/partial/i.test(s)));
		const year = card.match(YEAR)?.[1];
		companies.push({
			name,
			category: [
				...[...card.matchAll(THEME)].map(([, theme]) => tag(theme)),
				...details.sectors.map(tag),
				...details.place.split(',').map(tag),
				year ? `Invested ${year}` : '',
				said.some((s) => /partial exit/i.test(s)) ? 'Partial Exit' : '',
				exited ? 'Exited' : '',
				closed ? 'Closed' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: details.site || href
		});
	}

	if (companies.length === 0) {
		throw new Error('indico: no companies in the companies grid — the markup moved');
	}
	// without the company pages every company would link its page here
	if (withSite === 0) {
		throw new Error("indico: no company page gave its site — the pages' markup moved");
	}

	return companies;
}
