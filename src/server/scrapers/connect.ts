import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.connectventures.co';
const PAGE_URL = `${BASE_URL}/companies`;
// the pages, and the company pages, are asked for one at a time, a pause
// between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const MAX_PAGES = 50;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the companies page lists eighteen companies at a time, with a
// link to the next eighteen ("?6a1f289a_page=2", the parameter read from the
// link each run). a company's row carries what the page filters by: its
// name, its categories ("AI", "Enterprise"), its country, the year the fund
// invested and its status — "Active", "Acquired" (the way out) or "Retired",
// kept as a tag without the Exited tag. a company's own page links its site;
// those pages are fetched one at a time, and one that will not load leaves
// its company linking to it. a page of the list that will not load fails the
// run, as the list would be short.

const ROW = /(?=<div role="listitem" class="cms-portfolio-item w-dyn-item">)/;
const PROFILE = /<a href="(\/companies\/[^"]+)" class="portfolio-item-wrapper\b/;
const FIELD = (name: string) => new RegExp(`fs-cmsfilter-field="${name}" class="[^"]*">([^<]*)<`, 'g');
const NEXT = /<a\b[^>]*\bhref="\?(\w+_page=\d+)"[^>]*\bclass="[^"]*\bw-pagination-next\b/;
const SITE = /<a aria-label="visit company website" href="(https?:\/\/[^"]+)"/;
const ACQUIRED = /^acquired$/i;
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
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (resp.status !== 429) return resp;
	await resp.body?.cancel();
	await wait(REFUSED_MS);
	return fetch(url, { headers: { 'User-Agent': UA } });
}

// a company's site, from its page, or nothing when the page will not load
async function siteOf(profile: string): Promise<string> {
	try {
		const resp = await get(`${BASE_URL}${profile}`);
		if (!resp.ok) return '';
		return unescape((await resp.text()).match(SITE)?.[1] ?? '').trim();
	} catch {
		return '';
	}
}

interface Row {
	name: string;
	profile: string;
	tags: string[];
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const rows: Row[] = [];
	const seen = new Set<string>();
	let url = PAGE_URL;
	for (let page = 1; page <= MAX_PAGES; page++) {
		const resp = await get(url);
		if (!resp.ok) {
			throw new Error(`connect: page ${page} of the companies would not load (${resp.status})`);
		}
		const html = await resp.text();
		const found = html.split(ROW).slice(1);
		if (found.length === 0) {
			throw new Error(`connect: no companies on page ${page}`);
		}
		for (const row of found) {
			const field = (name: string) => [...row.matchAll(FIELD(name))].map(([, value]) => clean(value)).filter(Boolean);
			const name = field('name')[0] ?? '';
			const profile = row.match(PROFILE)?.[1] ?? '';
			if (!name || !profile || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			const status = field('status')[0] ?? '';
			const year = field('year')[0]?.match(/\b(?:19|20)\d{2}\b/)?.[0];
			const out = ACQUIRED.test(status);
			rows.push({
				name,
				profile,
				tags: [
					...field('category').map(tag),
					...field('location').map(tag),
					year ? `Invested ${year}` : '',
					UNSAID.test(status) ? '' : tag(status),
					out ? 'Exited' : ''
				].filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
			});
		}
		const next = html.match(NEXT)?.[1];
		if (!next) break;
		url = `${PAGE_URL}?${next}`;
		await wait(PACE_MS);
	}

	if (rows.length === 0) {
		throw new Error('connect: no companies on the companies page');
	}

	const companies: ScrapedCompany[] = [];
	let withSite = 0;
	for (const [i, row] of rows.entries()) {
		if (i > 0) await wait(PACE_MS);
		const site = await siteOf(row.profile);
		if (site) withSite++;
		companies.push({ name: row.name, category: row.tags.join(', '), url: site || `${BASE_URL}${row.profile}` });
	}
	// without the company pages every company would link the fund's site
	if (withSite === 0) {
		throw new Error("connect: no company page gave its site — the pages' markup moved");
	}

	return companies;
}
