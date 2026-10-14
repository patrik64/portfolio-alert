import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.backingminds.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
// no company page is begun past this, leaving the run its time
const DEADLINE_MS = 150_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace: the portfolio page is a gallery of logos, the companies held
// and then, under "Previous holdings", the ones the fund is out of. a logo
// names nothing — its alt text is a line about the company ("Digital health
// solutions") or the picture's file name — but most link the company's page
// here, which names it in its title ("Boneprox — Backingminds") and links
// its site. a logo linking only a site or nothing at all names its company
// nowhere and is left out. a company under "Previous holdings" is kept with
// the Exited tag.
//
// a company without its page has no name to list it by, so a company page
// that will not load, or is not reached by the deadline, fails the run
// rather than leave the company out.

const TILE = /<figure class="gallery-grid-item\b[^"]*"[^>]*>([\s\S]*?)<\/figure>/g;
const LINK = /<a\s+href="([^"]*)"[^>]*class="gallery-grid-image-link"/;
const PREVIOUS = />\s*Previous holdings\s*</;
const TITLE = /<title>\s*([^<]*?)\s*(?:&mdash;|—)\s*Backingminds\s*<\/title>/;
const MAIN = /<main\b[\s\S]*?<\/main>/;
const SITE = /href="(https?:\/\/[^"]+)"/g;
const SOCIAL = /\b(?:linkedin|instagram|facebook|twitter|x|youtube)\.com\b|backingminds\.com|squarespace\.com/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

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

async function pageText(url: string): Promise<string> {
	const resp = await get(url);
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

// a company page's name and site; a page that will not give its name fails the run
async function detailsOf(href: string): Promise<{ name: string; site: string }> {
	const html = await pageText(href);
	const name = clean(html.match(TITLE)?.[1] ?? '');
	if (!name) {
		throw new Error(`backingminds: ${href} names no company — the company pages' markup moved`);
	}
	const main = html.match(MAIN)?.[0] ?? '';
	const site = [...main.matchAll(SITE)].map(([, link]) => unescape(link)).find((link) => !SOCIAL.test(link));
	return { name, site: site ?? '' };
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const started = Date.now();
	const html = await pageText(PAGE_URL);
	const previous = html.search(PREVIOUS);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const match of html.matchAll(TILE)) {
		const link = unescape(match[1].match(LINK)?.[1] ?? '').trim();
		// only a logo linking its page here is named, by that page
		if (!link.startsWith('/')) continue;
		const href = new URL(link, BASE_URL).href;
		if (Date.now() - started >= DEADLINE_MS) {
			throw new Error('backingminds: the company pages ran past the deadline — the portfolio would be partial');
		}
		if (companies.length > 0) await wait(PACE_MS);
		const { name, site } = await detailsOf(href);
		if (STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		if (site) withSite++;
		const exited = previous >= 0 && (match.index ?? 0) > previous;
		companies.push({ name, category: exited ? 'Exited' : '', url: site || href });
	}

	if (companies.length === 0) {
		throw new Error('backingminds: no company page linked from the portfolio — the markup moved');
	}
	// without the company pages every company would link its page here
	if (withSite === 0) {
		throw new Error("backingminds: no company page gave its site — the pages' markup moved");
	}

	return companies;
}
