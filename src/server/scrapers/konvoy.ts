import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.konvoy.vc';
const PAGE_URL = `${BASE_URL}/portfolio`;
const BATCH_SIZE = 10;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, the whole grid on the one page. every card carries the month the
// fund invested, the company's location and a one-liner, and names the
// company in a hidden field the site's filter searches; the fund's stealth
// investments are named Stealth (sometimes with a date stuck on) and are
// left out until it says who they are. cards link only to pages of the
// fund's own, and each of those carries the company's address as its one
// link that leads off the site.

const CARD = '<a href="/portfolio/';
const TITLE = /fs-cmsfilter-field="title"[^>]*>([^<]*)</;
const INVESTED = /Invested:<\/p>\s*<p class="caption">[^<]*?(\d{4})</;
const LOCATION = /Location:<\/p>\s*<p class="caption">([^<]*)</;
const SITE = /href="(https?:\/\/[^"]+)"/g;
// the site's own furniture: anything here is not the company's address
const NOISE = /konvoy|website-files|google|linkedin|twitter|instagram|facebook|youtube|w3\.org|list-manage|apple\.com|spotify/;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a place written "Los Angeles, CA" would
// read as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

async function fetchPage(url: string) {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await fetchPage(PAGE_URL);

	const cards = html
		.split(CARD)
		.slice(1)
		.map((chunk) => ({
			slug: chunk.slice(0, chunk.indexOf('"')),
			name: clean(chunk.match(TITLE)?.[1] ?? ''),
			year: chunk.match(INVESTED)?.[1] ?? '',
			location: clean(chunk.match(LOCATION)?.[1] ?? '')
		}))
		.filter((c) => c.name && !/^stealth/i.test(c.name));
	if (cards.length === 0) {
		throw new Error('konvoy: no companies on the portfolio page');
	}

	const sites = new Map<string, string>();
	for (let i = 0; i < cards.length; i += BATCH_SIZE) {
		await Promise.all(
			cards.slice(i, i + BATCH_SIZE).map(async (card) => {
				try {
					const page = await fetchPage(`${PAGE_URL}/${card.slug}`);
					const site = [...page.matchAll(SITE)].map((m) => m[1]).find((u) => !NOISE.test(u));
					if (site) sites.set(card.slug, site);
				} catch {
					// the card already names the company; it just goes without its address
				}
			})
		);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of cards) {
		if (seen.has(card.name.toLowerCase())) continue;
		seen.add(card.name.toLowerCase());
		companies.push({
			name: card.name,
			category: [/to be announced/i.test(card.location) ? '' : tag(card.location), card.year]
				.filter(Boolean)
				.join(', '),
			url: sites.get(card.slug) ?? ''
		});
	}

	return companies;
}
