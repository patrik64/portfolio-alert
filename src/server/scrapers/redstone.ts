import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.redstone.vc';
const PAGE_URL = `${BASE_URL}/portfolio`;
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
// no company page is begun past this, leaving the run its time
const DEADLINE_MS = 150_000;
const MAX_PAGES = 30;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio is a grid of logos, a page of them at a time
// (?fdfd0e13_page=2), a logo a company linking its page here, with the
// company's name, its strategies ("FinTech", "DeepTech", "Venture Debt")
// and a badge on a company the fund is out of, "EXITED". a company's page
// adds where it is based, the year of the investment and its site, under
// "Visit webSite". the strategies, the place and the year are kept as tags,
// an exit with the Exited tag. every page of the list must load; a company
// page that will not, or is not reached by the deadline, leaves its company
// linking it.

const ITEM = /(?=<div\b[^>]*role="listitem" class="portfolio-collection-item w-dyn-item">)/;
const NAME = /<div fs-list-field="name" class="fs-name-source">([\s\S]*?)<\/div>/;
const PAGE = /<a href="(\/portfolio\/[^"]+)" class="collection-image-wrapper\b/;
const STRATEGY = /class="title-tag small">([\s\S]*?)<\/div>/g;
const EXITED = /class="title-tag small exited"/;
const NEXT = /<a href="(\?\w+_page=\d+)"[^>]*class="w-pagination-next\b/;
// a company page's facts: a label and its value
const FACT = /<p class="title-tag outline small">([\s\S]*?)<\/p>\s*<p class="p-small[^"]*">([\s\S]*?)<\/p>/g;
const SITE = /<a\b[^>]*href="([^"]*)"[^>]*class="link-wrapper w-inline-block"[^>]*>\s*<div class="all-caps">\s*Visit webSite/i;
const YEAR = /\b(?:19|20)\d{2}\b/;
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

interface Page {
	site: string;
	place: string[];
	year?: string;
}

// what a company's page says, or nothing when it will not load
async function pageOf(href: string): Promise<Page | null> {
	try {
		const resp = await get(href);
		if (!resp.ok) {
			await resp.body?.cancel();
			return null;
		}
		const html = await resp.text();
		const facts = new Map([...html.matchAll(FACT)].map(([, label, value]) => [clean(label).toLowerCase(), clean(value)]));
		const site = unescape(html.match(SITE)?.[1] ?? '').trim();
		return {
			site: /^https?:\/\//i.test(site) ? site : '',
			place: (facts.get('location') ?? '').split(',').map(clean),
			year: facts.get('investment year')?.match(YEAR)?.[0]
		};
	} catch {
		return null;
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const started = Date.now();

	// the whole list, a page at a time; a part of it must not pass for the whole
	const items: string[] = [];
	for (let path: string | undefined = '', page = 0; path !== undefined && page < MAX_PAGES; page++) {
		const url = `${PAGE_URL}${path}`;
		const resp = await get(url);
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${url}: ${resp.status}`);
		}
		const html = await resp.text();
		items.push(...html.split(ITEM).slice(1));
		path = html.match(NEXT)?.[1];
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const item of items) {
		const name = clean(item.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const path = item.match(PAGE)?.[1];
		const href = path ? `${BASE_URL}${path}` : '';
		const reached = !!href && Date.now() - started < DEADLINE_MS;
		if (reached && companies.length > 0) await wait(PACE_MS);
		const page = reached ? await pageOf(href) : null;
		if (page?.site) withSite++;
		companies.push({
			name,
			category: [
				...[...item.matchAll(STRATEGY)].map(([, strategy]) => tag(strategy)),
				...(page?.place ?? []),
				page?.year ? `Invested ${page.year}` : '',
				EXITED.test(item) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: page?.site || href || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('redstone: no companies on the portfolio page — the markup moved');
	}
	// without the company pages every company would link its page here
	if (withSite === 0) {
		throw new Error("redstone: no company page gave its site — the pages' markup moved");
	}

	return companies;
}
