import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.orbimed.com';
const PAGE_URL = `${BASE_URL}/portfolio/`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress on the fund's own theme. the grid the page serves is empty and the
// theme fills it from a json array written into the html above it — the whole
// portfolio, all 201 of them, in the one request. the sector and region
// dropdowns filter that array in the browser and Load More pages through it,
// so there is nothing else to ask for.
//
// what the grid draws is a wall of logos, each opening a panel rather than a
// link, so the array is also the only place the names are written. it carries
// the company's own address as well, and the seven the fund has none for keep
// its page for them instead.
//
// the fund files a company under one sector and one region — the two things
// the page lets a reader filter on — and both are read as tags. one company is
// filed under two regions, so the lists are read rather than the joined line
// the fund also keeps, which would otherwise arrive as one tag with a comma
// inside it.
//
// there is a field for a company the fund has been acquired out of. it is
// empty on all 201, so what it holds when it is filled cannot be read from
// here; anything in it is taken as the exit it names.

const ARRAY = /\bvar\s+data_portfolio\s*=/;

interface Terms {
	arr?: string[];
}

interface Entry {
	title?: string;
	slug?: string;
	website_url?: string;
	acquired?: string;
	sector_companies_post?: Terms;
	region_companies_post?: Terms;
}

const un = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

// the fund writes its regions with a non-breaking space in them, which the
// whitespace collapse takes out
const clean = (s: string) => un(s).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a term written with a comma in it would
// read as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// the array is cut out by counting brackets, so that a bracket inside a name
// or a write-up cannot end it early
const arrayAt = (source: string, from: number) => {
	let depth = 0;
	let inString = false;
	for (let at = from; at < source.length; at++) {
		const char = source[at];
		if (inString) {
			if (char === '\\') at++;
			else if (char === '"') inString = false;
			continue;
		}
		if (char === '"') inString = true;
		else if (char === '[') depth++;
		else if (char === ']' && --depth === 0) return source.slice(from, at + 1);
	}
	return '';
};

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const at = html.search(ARRAY);
	const opens = at === -1 ? -1 : html.indexOf('[', at);
	const literal = opens === -1 ? '' : arrayAt(html, opens);
	if (!literal) {
		throw new Error('orbimed: the portfolio is no longer written into the page');
	}

	let entries: Entry[];
	try {
		entries = JSON.parse(literal) as Entry[];
	} catch {
		throw new Error('orbimed: the portfolio came back in a shape that could not be read');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const entry of entries) {
		const name = clean(entry.title ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const slug = clean(entry.slug ?? '');
		const site = clean(entry.website_url ?? '');
		companies.push({
			name,
			category: [
				...(entry.sector_companies_post?.arr ?? []),
				...(entry.region_companies_post?.arr ?? []),
				clean(entry.acquired ?? '') ? 'Exited' : ''
			]
				.map(tag)
				.filter(Boolean)
				.join(', '),
			url: site || (slug ? `${BASE_URL}/companies/${slug}/` : '')
		});
	}

	if (companies.length === 0) {
		throw new Error('orbimed: no companies in the portfolio');
	}

	return companies;
}
