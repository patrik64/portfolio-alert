import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.lorimerventures.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, the whole collection on the one page with no paging. every card
// names the company, files it under a sector, points at the company's own
// address behind its Learn More button, and usually says where it sits. the
// wall is drawn twice over — once for the desktop and once for the phone — so
// every company arrives in duplicate and is kept once.

const ITEM = 'class="coll-item-logos-portfolio w-dyn-item"';
const NAME = /custom-title-name-portfolio">([^<]*)</;
// the sector is the unadorned div right behind the name's divider
const SECTOR = /div-divider-name-and-category"><\/div><div>([^<]*)</;
const LOCATION = /custom-text-location-card">([^<]*)</;
const SITE = /<a href="(https?:\/\/[^"]+)"[^>]*class="button-link-portfolio/;

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

// the category is comma-joined, so a place written "Brooklyn, NY" would read
// as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const name = clean(item.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({
			name,
			category: [tag(item.match(SECTOR)?.[1] ?? ''), tag(item.match(LOCATION)?.[1] ?? '')]
				.filter(Boolean)
				.join(', '),
			url: item.match(SITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('lorimer: no companies on the portfolio page');
	}

	return companies;
}
