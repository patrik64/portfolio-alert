import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.mseq.vc';
// /all-companies has redirected here since the rebuild of 2026-11-15
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BATCH_SIZE = 8;

// webflow, rebuilt on 2026-11-15: the portfolio is one grid of cards in place
// of the old tabs, a card each linking the fund's page for the company here,
// naming it and tagging it with the one "system" — the six challenges the fund
// sets itself ("Bridge the Gap to Space") — it answers, the system's slug held
// on the card for the page's filter. the system is kept as the tag, in the
// card's own words or else the name the page's filter gives its slug. the
// address is on the company's page, held for a script that makes a link of it.
//
// the rebuild shortened or lengthened a few names ("Arkeus AI" is now
// "Arkeus", "EVERY" is "The EVERY Company"), and each is kept under the name it
// was stored as, so it is not taken for a new company.
const STORED_AS: Record<string, string> = {
	arkeus: 'Arkeus AI',
	'the every company': 'EVERY',
	'regrow ag': 'Regrow',
	'xylo bio': 'XYLO'
};

const CARD = /<div\b(?=[^>]*\brole="listitem")[^>]*\bdata-sector="([^"]*)"[^>]*>([\s\S]*?)(?=<div\b[^>]*\brole="listitem"|$)/g;
const PAGE = /<a\b[^>]*\bhref="(\/portfolio\/[^"#?]+)"/;
const NAME = /class="work-card-name-block"[^>]*>\s*<div\b[^>]*>([\s\S]*?)<\/div>/;
const SYSTEM = /class="work-card-system-tag\b[^"]*"[^>]*>([\s\S]*?)<\/div>/;
// the filter's names for the systems' slugs: var NAMES={'bridge-the-gap-to-space':'Bridge the Gap to Space',…}
const FILTER_NAMES = /\bNAMES\s*=\s*\{([^{}]*)\}/;
const FILTER_NAME = /'([^']+)'\s*:\s*'([^']*)'/g;
const SITE = /\bdata-msv-site="([^"]*)"/;
const STEALTH = /^stealth\b/i;

const clean = (s: string) =>
	s
		.replace(/<[^>]+>/g, ' ')
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;|&#8220;|&#8221;/g, '"')
		.replace(/&nbsp;| /g, ' ')
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await fetchText(PAGE_URL);

	const systems = new Map<string, string>();
	for (const [, slug, name] of (html.match(FILTER_NAMES)?.[1] ?? '').matchAll(FILTER_NAME)) {
		systems.set(slug, tag(name));
	}

	const cards: { name: string; system: string; page: string }[] = [];
	const seen = new Set<string>();
	for (const [, sector, card] of html.matchAll(CARD)) {
		const written = clean(card.match(NAME)?.[1] ?? '');
		const name = STORED_AS[written.toLowerCase()] ?? written;
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		cards.push({
			name,
			system: tag(card.match(SYSTEM)?.[1] ?? '') || systems.get(sector) || '',
			page: card.match(PAGE)?.[1] ?? ''
		});
	}
	if (cards.length === 0) {
		throw new Error('mainsequence: no company cards on the portfolio page — the markup moved');
	}

	const companies: ScrapedCompany[] = [];
	for (let at = 0; at < cards.length; at += BATCH_SIZE) {
		const batch = cards.slice(at, at + BATCH_SIZE);
		const sites = await Promise.all(
			batch.map(async ({ page }) =>
				page ? clean((await fetchText(`${BASE_URL}${page}`)).match(SITE)?.[1] ?? '') : ''
			)
		);
		batch.forEach(({ name, system, page }, index) => {
			const site = sites[index];
			companies.push({
				name,
				category: system,
				url: /^https?:\/\//i.test(site) ? site : page ? `${BASE_URL}${page}` : PAGE_URL
			});
		});
	}

	return companies;
}
