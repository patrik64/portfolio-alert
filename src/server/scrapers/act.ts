import type { ScrapedCompany } from './types';

const BASE_URL = 'https://actventure.capital';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio is a list, the whole of it in the page, a row a
// company giving its name, whether it is "Live" or an "Exit", and its
// sectors ("AI/ML & Data", "Deep Tech"), linking a page of its own here
// that tells its story but links no site. the sectors are kept as tags, an
// exit with the Exited tag; a company links its page here.

const ITEM = /(?=<div\b[^>]*role="listitem" class="cms-item w-dyn-item")/;
const NAME = /class="project-title-list">([\s\S]*?)<\/div>/;
const PAGE = /<a\b[^>]*href="(\/portfolio\/[^"]+)"/;
const STATUS = /fs-list-field="status"[^>]*>([\s\S]*?)<\/div>/;
const SECTOR = /fs-list-field="category"[^>]*>([\s\S]*?)<\/div>/g;
const EXIT = /^exit(?:ed)?$/i;
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
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const page = item.match(PAGE)?.[1];
		companies.push({
			name,
			category: [
				...[...item.matchAll(SECTOR)].map(([, sector]) => tag(sector)),
				EXIT.test(clean(item.match(STATUS)?.[1] ?? '')) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: page ? `${BASE_URL}${unescape(page)}` : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('act: no companies on the portfolio page — the markup moved');
	}

	return companies;
}
