import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.notioncapital.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
const SITEMAP_URL = `${BASE_URL}/sitemap.xml`;
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio page is a wall of cards, each naming the company
// and linking its page on the fund's site, with "Invested" or "Exited" on
// it. webflow draws a hundred cards at most, and the fund has more, so the
// site's own map of pages supplies the rest: every page under /portfolio/
// is a company's. a company's page gives its name, its sector, the years
// it was founded and first invested in, the country of its headquarters
// and a link to its site, and on one the fund is out of a note on how it
// went ("Acquired by CUBE , July 2025"), kept without the date. a page
// that will not load leaves its company with what the card said, linking
// that page.

const CARD = /(?=<div role="listitem" class="company-card-wrapper w-dyn-item">)/;
const CARD_LINK = /href="\/portfolio\/([^"]+)" class="company-card-heading w-inline-block"[^>]*>\s*<h4[^>]*>([\s\S]*?)<\/h4>/;
const CARD_STATUS = /<div class="tag-legacy[^"]*">([^<]*)<\/div>/;
const PAGE = /<loc>https:\/\/www\.notioncapital\.com\/portfolio\/([^<]+)<\/loc>/g;
const NAME = /<h1 class="cs--heading">([\s\S]*?)<\/h1>/;
// a fact in the panel beside the name: its label, then its value or values
const FACT = /<div class="subh">([^<]*)<\/div>([\s\S]*?)(?=<div class="info-section">|<\/aside>)/g;
const VALUE = /<div class="info-text">([\s\S]*?)<\/div>/g;
const WENT = /<div class="tag-legacy card[^"]*">([^<]*)<\/div>/;
const SITE = /<a href="(https?:\/\/[^"]+)" class="cs-icon w-inline-block">/;
const EXIT = /^(acquired|merged|ipo|exited|listed)\b/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two;
// the date after the buyer's name ("Acquired by CUBE , July 2025") is dropped
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');
const outcome = (s: string) => tag(s.replace(/\s*,\s*[A-Z][a-z]+ \d{4}\s*$/, ''));

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

interface Page {
	name: string;
	tags: string[];
	went: string;
	site: string;
}

// what a company's page says, or nothing when it will not load
async function pageOf(slug: string): Promise<Page | null> {
	try {
		const html = await fetchText(`${PAGE_URL}/${slug}`);
		const facts = new Map<string, string[]>();
		for (const [, label, body] of html.matchAll(FACT)) {
			facts.set(clean(label).replace(/:$/, '').toLowerCase(), [...body.matchAll(VALUE)].map(([, v]) => tag(v)));
		}
		const year = (label: string) => facts.get(label)?.[0]?.match(/\b(?:19|20)\d{2}\b/)?.[0];
		return {
			name: clean(html.match(NAME)?.[1] ?? ''),
			tags: [
				...(facts.get('sector') ?? []),
				...(facts.get('headquarters') ?? []),
				year('founded') ? `Founded ${year('founded')}` : '',
				year('first invested') ? `Invested ${year('first invested')}` : ''
			],
			went: outcome(html.match(WENT)?.[1] ?? ''),
			site: unescape(html.match(SITE)?.[1] ?? '').trim()
		};
	} catch {
		return null;
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const [wall, sitemap] = await Promise.all([fetchText(PAGE_URL), fetchText(SITEMAP_URL)]);

	// the cards: a name and a standing for each slug
	const cards = new Map<string, { name: string; status: string }>();
	for (const card of wall.split(CARD).slice(1)) {
		const [, slug, name] = card.match(CARD_LINK) ?? [];
		if (slug) cards.set(slug, { name: clean(name), status: clean(card.match(CARD_STATUS)?.[1] ?? '') });
	}
	if (cards.size === 0) {
		throw new Error('notion: no companies on the portfolio page');
	}
	const slugs = [...new Set([...cards.keys(), ...[...sitemap.matchAll(PAGE)].map(([, slug]) => slug)])];

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [i, slug] of slugs.entries()) {
		if (i > 0) await wait(PACE_MS);
		const page = await pageOf(slug);
		const card = cards.get(slug);
		const name = page?.name || card?.name || '';
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const went = page?.went && EXIT.test(page.went) ? page.went : '';
		const out = Boolean(went) || /^exited$/i.test(card?.status ?? '');
		companies.push({
			name,
			category: [...(page?.tags ?? []), went || (out ? 'Exited' : ''), out && went ? 'Exited' : '']
				.filter((t, k, all) => t && all.indexOf(t) === k)
				.join(', '),
			url: page?.site || `${PAGE_URL}/${slug}`
		});
	}
	if (companies.length === 0) {
		throw new Error('notion: no companies on the portfolio page');
	}
	// without the pages every company would come in bare
	if (!companies.some((c) => c.url && !c.url.startsWith(BASE_URL))) {
		throw new Error('notion: no company page gave its site — the page layout moved');
	}

	return companies;
}
