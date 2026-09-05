import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.innovationindustries.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
const BATCH_SIZE = 10;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, the whole list on the one page: every card names its company, a
// tagline beside it, and the year the fund came in. cards link only to
// pages of the fund's own, and each of those carries the company's address
// as its first link that leads anywhere real — the footer's design-community
// and industry-body links are furniture.

const ITEM = /<a href="(\/portfolio\/[^"]+)" class="work-effect-container[\s\S]*?_1-7vw-text">(\d{4})<[\s\S]*?_7-5vw-title">([^<]*)</g;
const SITE = /href="(https?:\/\/[^"]+)"/g;
// the site's own furniture: anything here is not the company's address
const NOISE = /innovationindustries|website-files|gstatic|googleapis|google\.com|linkedin|twitter|youtube|instagram|facebook|behance|dribbble|nvp\.nl/;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

async function fetchPage(url: string) {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await fetchPage(PAGE_URL);

	const cards = [...html.matchAll(ITEM)].map(([, path, year, name]) => ({
		path,
		year,
		name: clean(name)
	}));
	if (cards.length === 0) {
		throw new Error('innovationindustries: no companies on the portfolio page');
	}

	const sites = new Map<string, string>();
	for (let i = 0; i < cards.length; i += BATCH_SIZE) {
		await Promise.all(
			cards.slice(i, i + BATCH_SIZE).map(async (card) => {
				try {
					const page = await fetchPage(`${BASE_URL}${card.path}`);
					const site = [...page.matchAll(SITE)].map((m) => m[1]).find((u) => !NOISE.test(u));
					if (site) sites.set(card.path, site);
				} catch {
					// the card already names the company; it just goes without its address
				}
			})
		);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of cards) {
		if (!card.name || seen.has(card.name.toLowerCase())) continue;
		seen.add(card.name.toLowerCase());
		companies.push({
			name: card.name,
			category: card.year,
			url: sites.get(card.path) ?? ''
		});
	}

	return companies;
}
