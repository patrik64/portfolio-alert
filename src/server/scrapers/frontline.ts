import type { ScrapedCompany } from './types';

const BASE_URL = 'https://frontline.vc';
const PAGE_URL = `${BASE_URL}/companies/`;
const FUNDS_URL = `${BASE_URL}/wp-json/wp/v2/fund?per_page=100&_fields=slug,name`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress with elementor: the companies page lists every company as a
// row of a loop, its name linking its site, a line about it, its country
// and, on one the fund is out of, "Acquired" (the way out) beside the name.
// the row's classes name the fund that holds it ("fund-frontline-seed"),
// spelled out by the site's own api ("Frontline Seed"); the fund and the
// country are kept as tags.

const ROW = /(?=<div data-elementor-type="loop-item")/;
const CLASSES = /^<div data-elementor-type="loop-item"[^>]*\bclass="([^"]*)"/;
const NAME = /<h3 class="elementor-heading-title[^"]*">(?:<a href="([^"]*)">)?([\s\S]*?)(?:<\/a>)?<\/h3>/;
// the outcome sits in a widget of its own beside the name
const OUTCOME = /<\/h3>\s*<\/div>\s*<\/div>\s*<div class="elementor-element[^"]*elementor-widget-text-editor"[^>]*>\s*<div class="elementor-widget-container">\s*([^<]{2,40}?)\s*<\/div>/;
const LOCATION = /\blocation elementor-widget[^"]*"[^>]*>\s*<div class="elementor-widget-container">\s*(?:<span>)?([^<]*)/;
const EXIT = /^(?:acquired|ipo|exited|merged)\b/i;
const STEALTH = /^stealth\b/i;

interface Term {
	slug?: string;
	name?: string;
}

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

export async function scrape(): Promise<ScrapedCompany[]> {
	const [page, funds] = await Promise.all([
		fetch(PAGE_URL, { headers: { 'User-Agent': UA } }),
		fetch(FUNDS_URL, { headers: { 'User-Agent': UA } })
	]);
	if (!page.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${page.status}`);
	}
	const html = await page.text();
	// the funds' names by slug; without them the slug is spelled out
	const fundNames = new Map<string, string>(
		funds.ok ? ((await funds.json()) as Term[]).map((t) => [t.slug ?? '', clean(t.name ?? '')]) : []
	);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const row of html.split(ROW).slice(1)) {
		const classes = row.match(CLASSES)?.[1].split(/\s+/) ?? [];
		if (!classes.includes('type-company')) continue;
		const [, href, written] = row.match(NAME) ?? [];
		const name = clean(written ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const held = classes
			.filter((c) => c.startsWith('fund-'))
			.map((c) => c.slice('fund-'.length))
			.map((slug) => fundNames.get(slug) || slug.replace(/-/g, ' ').replace(/\b[a-z]/g, (l) => l.toUpperCase()));
		const outcome = clean(row.match(OUTCOME)?.[1] ?? '');
		const out = EXIT.test(outcome);
		const site = unescape(href ?? '').trim();
		companies.push({
			name,
			category: [...held.map(tag), tag(row.match(LOCATION)?.[1] ?? ''), out ? tag(outcome) : '', out ? 'Exited' : '']
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('frontline: no companies on the companies page');
	}

	return companies;
}
