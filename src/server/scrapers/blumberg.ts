import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://blumbergcapital.com/portfolio-companies/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BATCH_SIZE = 5;

// wordpress and beaver builder, its grid served whole: a card per company with its
// name, "Acquired" on the ones it is, the fund's strategy as a class on the card and
// a link to the company's page on the site. only that page has the company's address,
// so it is visited, a few at a time; one that fails costs its link and nothing else.
const CARD = /(?=<div class="fl-post-column">)/;
const NAME = /<h5\b[^>]*>\s*<a\b[^>]*\bhref='([^']*)'[^>]*>([^<]*)/;
const ACQUIRED = />\s*Acquired\s*</;
const STRATEGY = /\bfund_type-([a-z-]+)/g;
const LINK = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/g;
const NOT_THE_COMPANY =
	/\/\/(?:[\w-]+\.)*(?:blumbergcapital|linkedin|twitter|x|facebook|instagram|youtube|addtoany|crunchbase|techcrunch|wordpress)\.com\b/i;
const CONTENT = 'fl-page-content';

const clean = (s: string) =>
	s
		.replace(/&amp;|&#038;/g, '&')
		.replace(/&#0?39;|&#8217;|&rsquo;/g, "'")
		.replace(/\s+/g, ' ')
		.trim();

// "early-stage" -> "Early Stage"
const titled = (slug: string) =>
	slug
		.split('-')
		.map((word) => word[0].toUpperCase() + word.slice(1))
		.join(' ');

async function siteOf(page: string): Promise<string> {
	try {
		const resp = await fetch(page, { headers: { 'User-Agent': UA } });
		if (!resp.ok) return '';
		const content = (await resp.text()).split(CONTENT)[1] ?? '';
		return [...content.matchAll(LINK)].map(([, href]) => href).find((href) => !NOT_THE_COMPANY.test(href)) ?? '';
	} catch {
		return '';
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const cards = (await resp.text()).split(CARD).slice(1);

	const entries: { name: string; page: string; category: string }[] = [];
	const seen = new Set<string>();
	for (const card of cards) {
		const [, page = '', shown = ''] = card.match(NAME) ?? [];
		const name = clean(shown);
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		// the classes come at the top of a card, whose last one runs on to the page's end
		const strategies = [...card.slice(0, card.indexOf('>', 30)).matchAll(STRATEGY)].map(([, slug]) => titled(slug));
		entries.push({
			name,
			page,
			category: [...strategies, ACQUIRED.test(card) ? 'Acquired' : '', ACQUIRED.test(card) ? 'Exited' : '']
				.filter(Boolean)
				.join(', ')
		});
	}
	if (entries.length === 0) {
		throw new Error('blumberg: no companies on the portfolio page');
	}

	const companies: ScrapedCompany[] = [];
	for (let i = 0; i < entries.length; i += BATCH_SIZE) {
		const batch = entries.slice(i, i + BATCH_SIZE);
		const sites = await Promise.all(batch.map(({ page }) => siteOf(page)));
		batch.forEach(({ name, category }, j) => companies.push({ name, category, url: sites[j] }));
	}

	return companies;
}
