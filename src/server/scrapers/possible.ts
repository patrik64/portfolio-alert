import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.possible.ventures';
const PAGE_URL = `${BASE_URL}/portfolio`;
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
// no company page is begun past this, leaving the run its time
const DEADLINE_MS = 150_000;
const MAX_PAGES = 40;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio is a grid of cards, fifteen a page
// (?b619903d_page=2), a card a company linking its page here, with its
// name, its category ("People", "Planet", "Productivity"), its sectors
// ("Energy Transition", "TechBio") and a line saying where it is and the
// stage the fund came in at ("… / Europe, Germany / Series A"). a company's
// page adds its site, under "Website". the category, the sectors, the
// country and the stage are kept as tags; the fund does not say which
// companies it is out of. every page of the grid must load; a company page
// that will not, or is not reached by the deadline, leaves its company
// linking it.

const CARD = /(?=<div\b[^>]*role="listitem" class="portfolio-item w-dyn-item">)/;
const NAME = /class="portfolio-card-company">([\s\S]*?)<\/div>/;
const PAGE = /<a href="(\/companies\/[^"]+)"/;
const CATEGORY = /<a href="\/categories\/[^"]*" class="tag\b[^"]*"><div>([\s\S]*?)<\/div>/;
const SECTOR = /fs-cmsfilter-field="Sector">([\s\S]*?)<\/div>/g;
// "Planet, Energy Transition / Europe, Germany / Series A"
const INFO = /class="text-s is-status">([\s\S]*?)<\/span>/;
const NEXT = /href="(\?\w+_page=\d+)"[^>]*class="w-pagination-next\b/;
const SITE = />\s*Website\s*<\/div>\s*<a href="([^"]*)"/i;
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

// a company page's site, or nothing when it will not load
async function siteOf(href: string): Promise<string> {
	try {
		const resp = await get(href);
		if (!resp.ok) {
			await resp.body?.cancel();
			return '';
		}
		const site = unescape((await resp.text()).match(SITE)?.[1] ?? '').trim();
		return /^https?:\/\//i.test(site) ? site : '';
	} catch {
		return '';
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const started = Date.now();

	// the whole grid, a page at a time; a part of it must not pass for the whole
	const cards: string[] = [];
	for (let path: string | undefined = '', page = 0; path !== undefined && page < MAX_PAGES; page++) {
		const url: string = `${PAGE_URL}${path}`;
		const resp: Response = await get(url);
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${url}: ${resp.status}`);
		}
		const html: string = await resp.text();
		cards.push(...html.split(CARD).slice(1));
		path = html.match(NEXT)?.[1];
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const card of cards) {
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const path = card.match(PAGE)?.[1];
		const href = path ? `${BASE_URL}${unescape(path)}` : '';
		const reached = !!href && Date.now() - started < DEADLINE_MS;
		if (reached && companies.length > 0) await wait(PACE_MS);
		const site = reached ? await siteOf(href) : '';
		if (site) withSite++;
		// the line's parts: the category and sectors, the place, the stage
		// the parts are set apart by a spaced slash; "Australia/NZ" is one place
		const [, place = '', stage = ''] = clean(card.match(INFO)?.[1] ?? '').split(/\s+\/\s*|\s*\/\s+/);
		const country = place.split(',').pop() ?? '';
		companies.push({
			name,
			category: [
				tag(card.match(CATEGORY)?.[1] ?? ''),
				...[...card.matchAll(SECTOR)].map(([, sector]) => tag(sector)),
				tag(country),
				tag(stage)
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: site || href || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('possible: no companies in the portfolio grid — the markup moved');
	}
	// without the company pages every company would link its page here
	if (withSite === 0) {
		throw new Error("possible: no company page gave its site — the pages' markup moved");
	}

	return companies;
}
