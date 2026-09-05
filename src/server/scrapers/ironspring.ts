import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://ironspring.com/portfolio-companies/';
const BATCH_SIZE = 10;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, the grid on the one page: every card names its company in a
// heading, files it under the fund's value-chain categories (build, design,
// distribute, operate) as a css class, and links to a page of the fund's
// own. that page carries the company's address as its one link that leads
// off the site, so the cards are read first and the pages in batches after.

const CARD = /class="grid single-gsp[^"]*gs-mix ([a-z ]+)"([\s\S]*?)(?=class="grid single-gsp|$)/g;
const NAME = /<h2>([^<]*)<\/h2>/;
const DETAIL = /class="gs_p_link" href="(https:\/\/ironspring\.com\/[^"]+)"/;
const SITE = /href="(https?:\/\/[^"]+)"/g;
// the site's own furniture: anything here is not the company's address
const NOISE = /ironspring|google|linkedin|twitter|instagram|facebook|youtube|w3\.org|wp\.com|gmpg|fonts/;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

const capitalize = (s: string) =>
	s
		.split(' ')
		.filter(Boolean)
		.map((w) => (/^[a-z]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w))
		.join(' ');

async function fetchPage(url: string) {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await fetchPage(PAGE_URL);

	const cards = [...html.matchAll(CARD)].map(([, categories, body]) => ({
		categories: clean(categories),
		name: clean(body.match(NAME)?.[1] ?? ''),
		detail: body.match(DETAIL)?.[1] ?? ''
	}));
	if (cards.length === 0) {
		throw new Error('ironspring: no companies on the portfolio page');
	}

	const sites = new Map<string, string>();
	for (let i = 0; i < cards.length; i += BATCH_SIZE) {
		await Promise.all(
			cards.slice(i, i + BATCH_SIZE).map(async (card) => {
				if (!card.detail) return;
				try {
					const page = await fetchPage(card.detail);
					const site = [...page.matchAll(SITE)].map((m) => m[1]).find((u) => !NOISE.test(u));
					if (site) sites.set(card.detail, site);
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
			category: card.categories.split(' ').filter(Boolean).map(capitalize).join(', '),
			url: sites.get(card.detail) ?? ''
		});
	}

	return companies;
}
