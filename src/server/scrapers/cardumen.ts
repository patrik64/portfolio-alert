import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.cardumencapital.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
// no company page is begun past this, leaving the run its time
const DEADLINE_MS = 150_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio page is a grid of logos, the whole of it in the
// page, a logo a holding linking its page here and carrying, for the page's
// filters, the fund it sits in ("DeepTech", "AgriFoodTech"), its region, its
// stage and its industry ("AI", "Future of Food"), with an "Exited" badge on
// the ones the fund is out of — the buyer shown only as a logo. the logos
// have no alt text and some pages are named for what the company does
// ("crop-genetics-startup"), so the company's name is read from its page,
// which also gives the year the fund invested and its site. the funds the
// fund of funds has backed are funds, not companies, and are left out. the
// fund, the industry, the region, the stage and the year are kept as tags,
// an exit with the Exited tag; a company the page still names only for
// what it does ("Nutraceuticals Startup") is left out, as stealth.
//
// a company without its page has no name to list it by, so a company page
// that will not load, or is not reached by the deadline, fails the run
// rather than leave the company out.

const CARD = /(?=<div[^>]*class="collection-item-2 portfolio-items w-dyn-item")/;
const PAGE = /<a href="([^"]*)" class="link-block\b/;
const FIELD = (name: string) => new RegExp(`fs-cmsfilter-field="${name}"[^>]*>([^<]*)<`, 'g');
// the badge, hidden on a company the fund still holds
const EXITED = /class="exited-indication-container"/;
const NAME = /<h1\b[^>]*class="display-1\b[^"]*"[^>]*>([\s\S]*?)<\/h1>/;
const TITLE = /<title>\s*([^<]*?)\s*\|\s*Cardumen Capital\s*<\/title>/;
const FACT = (label: string) =>
	new RegExp(`<div class="mg-bottom-16px mg-bottom-8px-mobile">${label}</div>\\s*<div class="text-single-24px[^"]*">([^<]*)<`);
const SITE = />Website<\/div>\s*<a\b[^>]*\bhref="([^"]*)"/;
const FUNDS = /^fund(?: of funds)?$/i;
const YEAR = /\b(?:19|20)\d{2}\b/;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
// a company not yet named, its page titled for what it does: "Nutraceuticals Startup"
const STEALTH = /^stealth\b|\bstartup$/i;

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

// a company page's name, year and site; a page that will not give its name fails the run
async function detailsOf(href: string): Promise<{ name: string; year?: string; site: string }> {
	const resp = await get(href);
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${href}: ${resp.status}`);
	}
	const html = await resp.text();
	const name = clean(html.match(NAME)?.[1] ?? '') || clean(html.match(TITLE)?.[1] ?? '');
	if (!name) {
		throw new Error(`cardumen: ${href} names no company — the company pages' markup moved`);
	}
	const site = unescape(html.match(SITE)?.[1] ?? '').trim();
	return {
		name,
		year: clean(html.match(FACT('Date'))?.[1] ?? '').match(YEAR)?.[0],
		site: /^https?:\/\//i.test(site) ? site : ''
	};
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
	const visited = new Set<string>();
	for (const card of html.split(CARD).slice(1)) {
		const path = card.match(PAGE)?.[1];
		if (!path) continue;
		const fields = (field: string) => [...card.matchAll(FIELD(field))].map(([, value]) => clean(value));
		// a holding in another fund is a fund, not a company
		if ([...fields('fund'), ...fields('stage')].some((value) => FUNDS.test(value))) continue;
		const href = new URL(unescape(path), BASE_URL).href;
		if (visited.has(href)) continue;
		visited.add(href);
		if (Date.now() - started >= DEADLINE_MS) {
			throw new Error('cardumen: the company pages ran past the deadline — the portfolio would be partial');
		}
		if (companies.length > 0) await wait(PACE_MS);
		const { name, year, site } = await detailsOf(href);
		if (STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			category: [
				...fields('fund').map(tag),
				...fields('industry').map(tag),
				...fields('region').map(tag),
				...fields('stage').map(tag),
				year ? `Invested ${year}` : '',
				EXITED.test(card) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: site || href
		});
	}

	if (companies.length === 0) {
		throw new Error('cardumen: no companies in the portfolio grid — the markup moved');
	}

	return companies;
}
