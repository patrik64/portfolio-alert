import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.moltenventures.com';
const PAGE_URL = `${BASE_URL}/portfolio/all`;
const EXITS_URL = `${BASE_URL}/portfolio/exits`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// craft: the portfolio is two pages of rows the visitor can open. "All"
// holds the companies the fund is in, each with a line about it, its sector
// ("Enterprise", "Health & Bio"), the year the fund invested, a link to its
// site and one to its profile here, whose titles name it ("Visit &Open
// website"). "Exits" holds the ones it is out of, with the sector, the
// location and the year of the exit, and no name written anywhere: only the
// logo, drawn from a folder the site uploads it into under the company's
// name ("Portfolio/Companies/Bright Computing/…"), which names it here. an
// exit has no site to link, so it links the exits page.

const ROW = /(?=<article class="portfolio-row\b)/;
const NAMED = /title="Visit ([^"]+?) website"|title="More info about ([^"]+)"/;
const SITE = /<a href="(https?:\/\/[^"]+)"[^>]*title="Visit [^"]+ website"/;
const PROFILE = /<a href="(\/portfolio\/[^"]+)"[^>]*title="More info about/;
const HEADER_CELLS = /<p class="portfolio-row__(?:text|title)[^"]*">([\s\S]*?)<\/p>/g;
const FACT = /<p class="fw-bold">([^<]*)<\/p>\s*<span class="portfolio-item__divider"><\/span>\s*<(?:p|a)\b[^>]*>([\s\S]*?)<\/(?:p|a)>/g;
const LOGO = /mask-image: url\('([^']+)'\)/;
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

// the folder a logo was uploaded into: "…/Companies/Bright%20Computing/x.svg"
// -> "Bright Computing"
const folderOf = (url: string) => {
	try {
		const parts = new URL(url).pathname.split('/').filter(Boolean);
		return parts.length >= 2 ? clean(decodeURIComponent(parts[parts.length - 2]).replace(/_+/g, ' ')) : '';
	} catch {
		return '';
	}
};

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

const factsOf = (row: string) =>
	new Map([...row.matchAll(FACT)].map(([, label, value]) => [clean(label).toLowerCase(), clean(value)]));

export async function scrape(): Promise<ScrapedCompany[]> {
	const [all, exits] = await Promise.all([fetchText(PAGE_URL), fetchText(EXITS_URL)]);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	const add = (company: ScrapedCompany) => {
		if (!company.name || STEALTH.test(company.name) || seen.has(company.name.toLowerCase())) return;
		seen.add(company.name.toLowerCase());
		companies.push(company);
	};

	for (const row of all.split(ROW).slice(1)) {
		const [, visit, about] = row.match(NAMED) ?? [];
		// the header's cells: the line about the company, then its sector
		const cells = [...row.matchAll(HEADER_CELLS)].map(([, cell]) => tag(cell));
		const year = factsOf(row).get('invested in')?.match(/\b(?:19|20)\d{2}\b/)?.[0];
		const site = unescape(row.match(SITE)?.[1] ?? '').trim();
		const profile = row.match(PROFILE)?.[1];
		add({
			name: clean(visit ?? about ?? ''),
			category: [cells[1] ?? '', year ? `Invested ${year}` : ''].filter(Boolean).join(', '),
			url: site || (profile ? `${BASE_URL}${profile}` : PAGE_URL)
		});
	}
	const current = companies.length;
	if (current === 0) {
		throw new Error('molten: no companies on the portfolio page');
	}

	for (const row of exits.split(ROW).slice(1)) {
		const logo = unescape(row.match(LOGO)?.[1] ?? '');
		// the header's cells: the sector, then the location, then the year
		const cells = [...row.matchAll(HEADER_CELLS)].map(([, cell]) => tag(cell));
		add({
			name: folderOf(logo),
			category: [cells[0] ?? '', cells[1] ?? '', 'Exited'].filter(Boolean).join(', '),
			url: EXITS_URL
		});
	}
	if (companies.length === current) {
		throw new Error('molten: no exits on the exits page — the page moved');
	}

	return companies;
}
