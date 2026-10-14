import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.luminarventures.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
// no company page is begun past this, leaving the run its time
const DEADLINE_MS = 150_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio page is a grid of cards, the whole of it in the
// page, a card a company with its name, its sector ("Green Transition"),
// who it sells to ("B2B", "B2C"), its stage ("Early", "Growth" or "Exit")
// and a status badge ("Active", "Exit"), linking its page here, which gives
// its site. the sector, the market and the stage are kept as tags, an exit
// with the Exited tag. a company page that will not load, or is not reached
// by the deadline, leaves its company linking it.

const CARD = /(?=<div\b[^>]*role="listitem" class="company-card__item\b[^"]*w-dyn-item")/;
const NAME = /^<div\b[^>]*>\s*<div class="label black">([\s\S]*?)<\/div>/;
const FIELD = (name: string) => new RegExp(`fs-cmsfilter-field="${name}" class="label black">([^<]*)<`, 'g');
const STATUS = /class="post__tag right-corner"><div>([^<]*)<\/div>/;
const PAGE = /href="(\/portfolio\/[^"]+)" class="company-card__link\b/;
const SITE = /<div class="label">Website<\/div>\s*<a\b[^>]*\bhref="([^"]*)"/;
const EXIT = /^exit(?:ed)?$/i;
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
	const resp = await get(PAGE_URL);
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const card of html.split(CARD).slice(1)) {
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const fields = (field: string) => [...card.matchAll(FIELD(field))].map(([, value]) => clean(value));
		const stages = fields('stage');
		const exited = stages.some((s) => EXIT.test(s)) || EXIT.test(clean(card.match(STATUS)?.[1] ?? ''));
		const path = card.match(PAGE)?.[1];
		const href = path ? new URL(unescape(path), BASE_URL).href : '';
		const reached = !!href && Date.now() - started < DEADLINE_MS;
		if (reached && companies.length > 0) await wait(PACE_MS);
		const site = reached ? await siteOf(href) : '';
		if (site) withSite++;
		companies.push({
			name,
			category: [
				...fields('sector').map(tag),
				...fields('focus').map(tag),
				...stages.filter((s) => !EXIT.test(s)).map(tag),
				exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: site || href || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('luminar: no companies in the portfolio grid — the markup moved');
	}
	// without the company pages every company would link its page here
	if (withSite === 0) {
		throw new Error("luminar: no company page gave its site — the pages' markup moved");
	}

	return companies;
}
