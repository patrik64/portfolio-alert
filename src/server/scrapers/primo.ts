import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.primo.capital';
const PAGE_URL = `${BASE_URL}/portfolio`;
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
// no company page is begun past this, leaving the run its time
const DEADLINE_MS = 150_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio page shows its companies twice, as a grid of cards
// and as a list, the whole of it in the page; the grid's cards carry, for
// the page's filters and sorting, each company's name, the strategy it was
// backed from ("Digital", "Space", "Health", "Climate") and whether the fund
// has written it off or exited it, and link its page here, which gives its
// site. the strategy is kept as a tag, an exit with the Exited tag and a
// write-off with the Closed tag. a company page that will not load, or is
// not reached by the deadline, leaves its company linking it.

const GRID = /<div data-w-tab="Tab 1" class="w-tab-pane\b[\s\S]*?(?=<div data-w-tab="Tab 2" class="w-tab-pane\b)/;
const CARD = /(?=<div role="listitem" class="w-dyn-item">)/;
const FIELD = (name: string) => new RegExp(`fs-cmssort-field="${name}">([^<]*)<`);
const STRATEGY = /fs-cmsfilter-field="strategies">([^<]*)</g;
const PAGE = /<a href="([^"]*)" class="grey-card\b/;
const SITE = /<a href="([^"]*)"[^>]*class="portfolio-item v2\b/;
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
	const grid = (await resp.text()).match(GRID)?.[0] ?? '';

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const card of grid.split(CARD).slice(1)) {
		const field = (name: string) => clean(card.match(FIELD(name))?.[1] ?? '');
		const name = field('name');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const path = card.match(PAGE)?.[1];
		const href = path ? new URL(unescape(path), BASE_URL).href : '';
		const reached = !!href && Date.now() - started < DEADLINE_MS;
		if (reached && companies.length > 0) await wait(PACE_MS);
		const site = reached ? await siteOf(href) : '';
		if (site) withSite++;
		companies.push({
			name,
			category: [
				...[...card.matchAll(STRATEGY)].map(([, strategy]) => tag(strategy)),
				field('exit') === 'true' ? 'Exited' : '',
				field('write-off') === 'true' ? 'Closed' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: site || href || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('primo: no companies in the portfolio grid — the markup moved');
	}
	// without the company pages every company would link its page here
	if (withSite === 0) {
		throw new Error("primo: no company page gave its site — the pages' markup moved");
	}

	return companies;
}
