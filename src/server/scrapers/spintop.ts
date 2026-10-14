import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://spintopventures.com/portfolio/';
const MAX_PAGES = 40;
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
// no company page is begun past this, leaving the run its time
const DEADLINE_MS = 150_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: the portfolio is a grid of logos, thirty a page
// (/portfolio/page/2/), a logo a company linking its page here. the logos
// have no alt text, and the company's page alone names it, in its heading
// ("Acamp"), with a few lines about it — no site, no year and nothing
// saying which companies the fund is out of — so every company links its
// page here and carries no tags. every page of the grid must load.
//
// a company without its page has no name to list it by, so a company page
// that will not load, or is not reached by the deadline, fails the run
// rather than leave the company out.

const CARD = /<a href="([^"]*)" class="portfolioCard_link"/g;
const NEXT = /<a class="next page-numbers" href="([^"]*)"/;
const NAME = /<h1>([\s\S]*?)<\/h1>/;
const TITLE = /<title>\s*([^<]*?)\s*-\s*Spintop\s*<\/title>/;
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

// a company page's name; a page that will not give it fails the run
async function nameOf(href: string): Promise<string> {
	const html = await pageText(href);
	const name = clean(html.match(NAME)?.[1] ?? '') || clean(html.match(TITLE)?.[1] ?? '');
	if (!name) {
		throw new Error(`spintop: ${href} names no company — the company pages' markup moved`);
	}
	return name;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const started = Date.now();

	// the whole grid, a page at a time; a part of it must not pass for the whole
	const pages: string[] = [];
	for (let url: string | undefined = PAGE_URL, page = 0; url !== undefined && page < MAX_PAGES; page++) {
		const html: string = await pageText(url);
		for (const [, href] of html.matchAll(CARD)) {
			const link = unescape(href).trim();
			if (/^https?:\/\//i.test(link) && !pages.includes(link)) pages.push(link);
		}
		const next: string | undefined = html.match(NEXT)?.[1];
		url = next ? unescape(next) : undefined;
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const href of pages) {
		if (Date.now() - started >= DEADLINE_MS) {
			throw new Error('spintop: the company pages ran past the deadline — the portfolio would be partial');
		}
		if (companies.length > 0) await wait(PACE_MS);
		const name = await nameOf(href);
		if (STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: '', url: href });
	}

	if (companies.length === 0) {
		throw new Error('spintop: no companies in the portfolio grid — the markup moved');
	}

	return companies;
}
