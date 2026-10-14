import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.newion.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio is a list, the whole of it in the page ("see
// more" only shows the rest), a row a company giving its name, its city
// and country, the year the fund invested and whether it is "active" or
// "exited". a row opens a panel, kept in the page beside the list and
// matched to it by name, linking the company's site. the city, the country
// and the year are kept as tags, an exit with the Exited tag. a company
// whose panel links nowhere links the portfolio.

const ROW = /(?=<div portfolio="[^"]*" role="listitem" class="portfolio-item\b)/;
const NAME = /class="text-4xl pl-8 title no-anim">([\s\S]*?)<\/p>/;
const CITY = /class="city-wrapper"><p\b[^>]*>([\s\S]*?)<\/p>/;
const COUNTRY = /class="text-base pl-16px no-anim country">([\s\S]*?)<\/p>/;
const YEAR = /class="text-base no-anim">\s*((?:19|20)\d{2})\s*<\/p>/;
const STATUS = /class="text-base text-color-medium-grey no-anim">([\s\S]*?)<\/p>/;
// a panel, named for its company, and the link it carries
const PANEL = /<div portfolio-item="([^"]*)" role="listitem" class="portfolio-item-popup\b/g;
const SITE = /<a href="([^"]*)" class="url-to-be-added-to-btn\b/;
const EXITED = /^exited$/i;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
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

// "the Netherlands" and "The Netherlands" are the one place
const place = (s: string) => {
	const t = tag(s);
	return t && t[0].toUpperCase() + t.slice(1);
};

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	// each panel's link, by the name it is kept under
	const sites = new Map<string, string>();
	const panels = [...html.matchAll(PANEL)];
	panels.forEach((panel, i) => {
		const body = html.slice(panel.index, panels[i + 1]?.index);
		const site = unescape(body.match(SITE)?.[1] ?? '').trim();
		if (/^https?:\/\//i.test(site)) sites.set(clean(panel[1]).toLowerCase(), site);
	});

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const row of html.split(ROW).slice(1)) {
		const name = clean(row.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const year = row.match(YEAR)?.[1];
		companies.push({
			name,
			category: [
				place(row.match(CITY)?.[1] ?? ''),
				place(row.match(COUNTRY)?.[1] ?? ''),
				year ? `Invested ${year}` : '',
				EXITED.test(clean(row.match(STATUS)?.[1] ?? '')) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: sites.get(name.toLowerCase()) ?? PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('newion: no companies on the portfolio page — the markup moved');
	}

	return companies;
}
