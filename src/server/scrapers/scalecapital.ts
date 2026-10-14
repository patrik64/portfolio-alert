import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.scalecapital.com/portfolio';
const MAX_PAGES = 40;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio is a list of rows, the whole of it in the page, a
// row a company with its name, a line about it, its sector ("Enterprise
// Software"), its country and its status ("Active", "Exited"), opening a
// panel with its segment ("Spend Management Platform"), its headquarters,
// the stage the fund came in at, the year it invested and links to its
// site and its linkedin; a company the fund counts in its european
// resilience theme is marked so for the page's filter. the sector, the
// segment, the country, the theme and the year are kept as tags, an exit
// with the Exited tag. a list paged by webflow would be read page by page,
// every page of it.

const ROW = /(?=<div data-hoverimg="raise" role="listitem" class="collection-item w-dyn-item">)/;
const NAME = /<h2 class="company-name">([\s\S]*?)<\/h2>/;
const FIELD = (name: string) => new RegExp(`fs-list-field="${name}"[^>]*>([^<]*)<`);
const FACT = (label: string) =>
	new RegExp(
		`text-color-gray">${label}</div><div class="spacer-0-25rem"></div><div class="head-tag is-smaller">([^<]*)<`,
		'i'
	);
const SITE = /<a href="([^"]*)" target="_blank" class="string-link w-inline-block"><div>website<\/div>/;
const NEXT = /href="(\?\w+_page=\d+)"[^>]*class="w-pagination-next\b/;
const YEAR = /^(?:19|20)\d{2}$/;
const EXITED = /^exited$/i;
const UNSAID = /^(?:-|other|others|all|n\/a|active)$/i;
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

export async function scrape(): Promise<ScrapedCompany[]> {
	// the whole list, a page at a time; a part of it must not pass for the whole
	const rows: string[] = [];
	for (let path: string | undefined = '', page = 0; path !== undefined && page < MAX_PAGES; page++) {
		const url: string = `${PAGE_URL}${path}`;
		const resp: Response = await fetch(url, { headers: { 'User-Agent': UA } });
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${url}: ${resp.status}`);
		}
		const html: string = await resp.text();
		rows.push(...html.split(ROW).slice(1));
		path = html.match(NEXT)?.[1];
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let withSite = 0;
	for (const row of rows) {
		const name = clean(row.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const fact = (label: string) => clean(row.match(FACT(label))?.[1] ?? '');
		const year = fact('investment year');
		const site = unescape(row.match(SITE)?.[1] ?? '').trim();
		if (/^https?:\/\//i.test(site)) withSite++;
		companies.push({
			name,
			category: [
				tag(row.match(FIELD('sector'))?.[1] ?? ''),
				tag(fact('segment')),
				tag(row.match(FIELD('country'))?.[1] ?? ''),
				tag(row.match(FIELD('resilience'))?.[1] ?? ''),
				YEAR.test(year) ? `Invested ${year}` : '',
				EXITED.test(fact('status')) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('scalecapital: no companies in the portfolio list — the markup moved');
	}
	if (withSite === 0) {
		throw new Error("scalecapital: no company links its site — the rows' markup moved");
	}

	return companies;
}
