import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://innovating.capital/companies/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, the companies a custom post list the rest api does not expose,
// all of it on the one page: the filters hide cards rather than fetch them,
// and the list runs from 800.com to xion without a second page.
//
// each card is written twice, once as the row and once as the panel the row
// opens, so only the row is read: the name, the sector, how the fund holds it
// — venture, platform, or digital assets, under which it lists bitcoin and
// ethereum beside the companies — and the site, as a protocol-relative link.

const CARD = '<div class="pld-post-list-item-wrapper">';
const NAME = /<h3 class="pld-post-title">([\s\S]*?)<\/h3>/;
const SECTOR = /<div class="pld-post-position">([\s\S]*?)<\/div>/;
const HOLDING = /<div class="pld-post-profession">([\s\S]*?)<\/div>/;
const SITE = /<div class="website-content">\s*<a href="([^"]+)"/;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&#8211;|&ndash;/g, '–')
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) =>
	unescape(s.replace(/<[^>]+>/g, ''))
		.replace(/\s+/g, ' ')
		.trim();

const address = (href: string) => (href.startsWith('//') ? `https:${href}` : href);

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of html.split(CARD).slice(1)) {
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			category: [clean(card.match(SECTOR)?.[1] ?? ''), clean(card.match(HOLDING)?.[1] ?? '')]
				.filter(Boolean)
				.join(', '),
			url: address(card.match(SITE)?.[1] ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('innovatingcapital: no companies on the companies page');
	}

	return companies;
}
