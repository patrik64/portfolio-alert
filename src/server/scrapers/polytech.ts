import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.polytechventures.ch';
const PAGE_URL = `${BASE_URL}/portfolio`;
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
// no company page is begun past this, leaving the run its time
const DEADLINE_MS = 150_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio is a list of rows, the whole of it in the page, a
// row a company linking its page here, with its logo named for it, its
// sector ("Fintech", "Proptech"), a line about it and the year the fund
// invested — the year runs after a company's founding ("Founded in 2014",
// Lunaphore's row says 2016). a company's page adds its site. the sector
// and the year are kept as tags; the fund does not say which companies it
// is out of. a company page that will not load, or is not reached by the
// deadline, leaves its company linking it.

const ROW = /<a\b[^>]*href="([^"]*)"[^>]*class="card portfolio-row-card\b[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
const NAME = /<img\b[^>]*\balt="([^"]*)"/;
const SECTOR = /fs-cmsfilter-field="categories" class="category">([^<]*)</;
const YEAR = /class="portfolio-item-year"><div class="text-single-24px">\s*((?:19|20)\d{2})/;
const SITE = />Website<\/div>\s*<a href="([^"]*)"/;
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
	for (const [, path, row] of html.matchAll(ROW)) {
		const name = clean(row.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const href = new URL(unescape(path), BASE_URL).href;
		const reached = Date.now() - started < DEADLINE_MS;
		if (reached && companies.length > 0) await wait(PACE_MS);
		const site = reached ? await siteOf(href) : '';
		if (site) withSite++;
		const year = row.match(YEAR)?.[1];
		companies.push({
			name,
			category: [tag(row.match(SECTOR)?.[1] ?? ''), year ? `Invested ${year}` : '']
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: site || href
		});
	}

	if (companies.length === 0) {
		throw new Error('polytech: no companies in the portfolio list — the markup moved');
	}
	// without the company pages every company would link its page here
	if (withSite === 0) {
		throw new Error("polytech: no company page gave its site — the pages' markup moved");
	}

	return companies;
}
