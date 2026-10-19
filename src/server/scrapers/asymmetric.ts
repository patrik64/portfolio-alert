import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.acp.vc';
const PAGE_URL = `${BASE_URL}/companies`;
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const DEADLINE_MS = 150_000;
const MAX_PAGES = 10;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the companies page is a collection list of cards, each linking
// the company's page on the fund's site, naming the company over a line
// about it and, in a hidden nested list that the filter reads, the
// categories it is filed under ("Software", "Marketplace"). the company's
// own page adds a "Visit website" button, the year it was founded and the
// year of the fund's investment, so each is fetched one at a time within a
// time budget; a company whose page will not load keeps the card's fields
// and links its page on the fund's site. the list fits one page today and
// would gain webflow's "next" link past a hundred companies, which is
// followed. no company is marked as exited anywhere on the site.

const ITEM = /(?=<div role="listitem" class="companies__item w-dyn-item">)/;
const LINK = /<a\b[^>]*\bhref="(\/portfolio-companies\/[^"]+)"/;
const NAME = /class="company__name">([\s\S]*?)<\/div>/;
const CATEGORY = /fs-cmsfilter-field="Category">([^<]*)</g;
const NEXT = /href="(\?\w+_page=\d+)"[^>]*class="w-pagination-next\b/;
// on the company's page
const SITE = /<a\b[^>]*\bhref="([^"]*)"[^>]*\bclass="button"[^>]*>\s*Visit website/i;
const FOUNDED = /<h5>\s*Year founded\s*<\/h5>\s*<p>([^<]*)<\/p>/i;
const INVESTED = /<h5>\s*Year of Asymmetric Investment\s*<\/h5>\s*<p>([^<]*)<\/p>/i;
const YEAR = /^\d{4}$/;
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

// the company's page on the fund's site, or nothing when it will not load;
// a refusal is waited out once
async function pageOf(url: string): Promise<string> {
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const resp = await fetch(url, { headers: { 'User-Agent': UA } });
			if (resp.status === 429 && attempt === 0) {
				await resp.body?.cancel();
				await wait(REFUSED_MS);
				continue;
			}
			if (!resp.ok) return '';
			return await resp.text();
		} catch {
			return '';
		}
	}
	return '';
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const started = Date.now();
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let url: string = PAGE_URL;
	for (let page = 1; ; page++) {
		if (page > MAX_PAGES) {
			throw new Error(`asymmetric: the list runs past ${MAX_PAGES} pages`);
		}
		const resp: Response = await fetch(url, { headers: { 'User-Agent': UA } });
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${url}: ${resp.status}`);
		}
		const html: string = await resp.text();
		const items = html.split(ITEM).slice(1);
		if (items.length === 0) {
			throw new Error(`asymmetric: no companies on page ${page} of the list`);
		}
		for (const item of items) {
			const name = clean(item.match(NAME)?.[1] ?? '');
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			const link = unescape(item.match(LINK)?.[1] ?? '').trim();
			const own = link ? `${BASE_URL}${link}` : '';
			let detail = '';
			if (own && Date.now() - started < DEADLINE_MS) {
				await wait(PACE_MS);
				detail = await pageOf(own);
			}
			const site = unescape(detail.match(SITE)?.[1] ?? '').trim();
			const founded = clean(detail.match(FOUNDED)?.[1] ?? '');
			const invested = clean(detail.match(INVESTED)?.[1] ?? '');
			companies.push({
				name,
				category: [
					...[...item.matchAll(CATEGORY)].map(([, c]) => tag(c)),
					YEAR.test(founded) ? `Founded ${founded}` : '',
					YEAR.test(invested) ? `Invested ${invested}` : ''
				]
					.filter((t, i, all) => t && all.indexOf(t) === i)
					.join(', '),
				url: /^https?:\/\//i.test(site) ? site : own || PAGE_URL
			});
		}
		const next = html.match(NEXT)?.[1];
		if (!next) break;
		url = `${PAGE_URL}${unescape(next)}`;
	}

	if (companies.length === 0) {
		throw new Error('asymmetric: no companies on the list');
	}
	if (!companies.some((c) => c.category)) {
		throw new Error('asymmetric: the category markers moved');
	}

	return companies;
}
