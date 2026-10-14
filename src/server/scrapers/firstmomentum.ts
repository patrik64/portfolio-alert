import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.firstmomentum.vc/portfolio';
const MAX_PAGES = 40;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio is a list of rows, fifteen a page
// (?d085644f_page=2), each page loaded under the last, a row a company with
// its name, its industries ("DEV TOOLS & INFRA"), its country and the stage
// the fund came in at ("Pre-Seed", "Seed") or "Acquired", opening a panel
// with the year the fund invested, its founders, links to its site and its
// linkedin, and press about it. the industries, the country, the stage and
// the year are kept as tags. an industry is written as the page's filter
// writes it: the rows' own spellings vary ("MACHINE LEARNING", "Machine
// Learning"), and one row runs two together ("CLIMATE & ENERGY INDUSTRIAL").
// every page of the list must load.

const ROW = /(?=<div\b[^>]*role="listitem" class="portfolio-item w-dyn-item">)/;
const NAME = /class="portf-item-cont"><div class="h5">([\s\S]*?)<\/div>/;
const LABEL = /fs-cmsfilter-field="industry" class="h5 w-form-label"[^>]*>([^<]*)</g;
const FIELD = (name: string) => new RegExp(`fs-cmsfilter-field="${name}" class="[^"]*">([^<]*)<`, 'g');
const SITE = /href="([^"]*)" target="_blank" class="about-link is-portf tab-hide\b/;
const NEXT = /href="(\?\w+_page=\d+)"[^>]*class="w-pagination-next\b/;
const YEAR = /\b(?:19|20)\d{2}\b/;
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

// the filter's labels a row's industry holds, or the industry as written
const industries = (value: string, labels: string[]) => {
	const held = labels.filter((label) => value.toLowerCase().includes(label.toLowerCase()));
	return held.length > 0 ? held : [value];
};

export async function scrape(): Promise<ScrapedCompany[]> {
	// the whole list, a page at a time; a part of it must not pass for the whole
	const rows: string[] = [];
	const labels: string[] = [];
	for (let path: string | undefined = '', page = 0; path !== undefined && page < MAX_PAGES; page++) {
		const url: string = `${PAGE_URL}${path}`;
		const resp: Response = await fetch(url, { headers: { 'User-Agent': UA } });
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${url}: ${resp.status}`);
		}
		const html: string = await resp.text();
		rows.push(...html.split(ROW).slice(1));
		for (const [, label] of html.matchAll(LABEL)) {
			if (!labels.includes(tag(label))) labels.push(tag(label));
		}
		path = html.match(NEXT)?.[1];
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const row of rows) {
		const name = clean(row.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		// the row writes each field again in its panel; the repeats fall away below
		const fields = (field: string) => [...row.matchAll(FIELD(field))].map(([, value]) => tag(value));
		const year = fields('year').join(' ').match(YEAR)?.[0];
		const site = unescape(row.match(SITE)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [
				...fields('industry').flatMap((value) => industries(value, labels)),
				...fields('location'),
				...fields('stage'),
				year ? `Invested ${year}` : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('firstmomentum: no companies in the portfolio list — the markup moved');
	}

	return companies;
}
