import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.bostonmillenniapartners.com/portfolio/';
// the grid as the page's stage filter narrows it to the companies the fund is out of
const PREVIOUS_URL = `${PAGE_URL}?portfolio-stage%5B%5D=previous`;
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
// no company page is begun past this, leaving the run its time
const DEADLINE_MS = 150_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the portfolio page is a grid of logos, the whole of it in the
// page, a logo a company named over it ("Precision Digital Health, Inc.")
// and linking its page here. the page's stage filter ("Active",
// "Previous") narrows the grid in the page too, so the grid as filtered to
// "Previous" says which companies the fund is out of. a company's page
// adds where it is ("Boston", "MA") and its site. the legal form is
// not part of a name. the place is kept as tags, a previous holding with
// the Exited tag. a company page that will not load, or is not reached by
// the deadline, leaves its company linking it.

const ITEM = /<div class="grid-item">\s*<div class="grid_hover">\s*<h3>([\s\S]*?)<\/h3>\s*<a href="([^"]*)"/g;
const PLACE = (part: string) => new RegExp(`<span itemprop="${part}">([^<]*)</span>`);
const SITE = /<div class="web"><a itemprop="url" href="([^"]*)"/;
const FORM = /,?\s+(?:inc|llc|ltd|corp|co)\.?$/i;
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

// the grid's companies, as each name and the page it links
async function gridOf(url: string): Promise<[string, string][]> {
	const resp = await get(url);
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	const html = await resp.text();
	return [...html.matchAll(ITEM)].map(([, name, href]) => [clean(name), unescape(href).trim()]);
}

// a company page's city and state and its site, or nothing when it will not load
async function detailsOf(href: string): Promise<{ place: string[]; site: string }> {
	try {
		const resp = await get(href);
		if (!resp.ok) {
			await resp.body?.cancel();
			return { place: [], site: '' };
		}
		const html = await resp.text();
		const site = unescape(html.match(SITE)?.[1] ?? '').trim();
		return {
			place: ['addressLocality', 'addressRegion'].map((part) => clean(html.match(PLACE(part))?.[1] ?? '')),
			site: /^https?:\/\//i.test(site) ? site : ''
		};
	} catch {
		return { place: [], site: '' };
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const started = Date.now();
	const grid = await gridOf(PAGE_URL);
	const previous = await gridOf(PREVIOUS_URL);
	// a filter the page stopped honouring would mark the whole grid exited
	if (grid.length > 0 && previous.length >= grid.length) {
		throw new Error("bostonmillennia: the stage filter no longer narrows the grid — the page's filter moved");
	}
	const exited = new Set(previous.map(([, href]) => href));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const [written, href] of grid) {
		const name = written.replace(FORM, '').trim() || written;
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const reached = /^https?:\/\//i.test(href) && Date.now() - started < DEADLINE_MS;
		if (reached && companies.length > 0) await wait(PACE_MS);
		const { place, site } = reached ? await detailsOf(href) : { place: [], site: '' };
		if (site) withSite++;
		companies.push({
			name,
			category: [...place.map(tag), exited.has(href) ? 'Exited' : '']
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: site || href || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('bostonmillennia: no companies in the portfolio grid — the markup moved');
	}
	// without the company pages every company would link its page here
	if (withSite === 0) {
		throw new Error("bostonmillennia: no company page gave its site — the pages' markup moved");
	}

	return companies;
}
