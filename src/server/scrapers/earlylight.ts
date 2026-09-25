import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.earlylight.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: two lists of logos, the fund's own portfolio and, headed
// "syndicate portfolio", the deals its syndicate did, tagged so. every logo
// links the company's site and names it in its alt text; one the fund is
// out of wears an "Acquired" badge that is left invisible on the rest.

const LIST = /(?=<div[^>]*class="wrap w-dyn-list")/;
const ITEM = /(?=<div[^>]*class="item w-dyn-item")/;
const LINK = /<a\b[^>]*\bhref="([^"]*)"[^>]*class="[^"]*\bitem-link\b/;
const LOGO = /<img\b[^>]*\balt="([^"]*)"[^>]*class="[^"]*\bicons\b[^"]*"/;
const BADGE = /<div class="badge">[\s\S]*?class="text-block"[^>]*>([\s\S]*?)<\/div>/;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

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
	for (const list of html.split(LIST).slice(1)) {
		// the heading before a list names it
		const before = html.slice(0, html.indexOf(list));
		const heading = clean(before.match(/<h[1-3][^>]*>(?:(?!<h[1-3])[\s\S])*$/)?.[0] ?? '');
		const syndicate = /syndicate/i.test(heading);
		for (const chunk of list.split(ITEM).slice(1)) {
			const item = chunk.split('</a>')[0];
			const name = clean(item.match(LOGO)?.[1] ?? '');
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			const outcome = tag(item.match(BADGE)?.[1] ?? '');
			companies.push({
				name,
				category: [syndicate ? 'Syndicate' : '', outcome, outcome ? 'Exited' : ''].filter(Boolean).join(', '),
				url: unescape(item.match(LINK)?.[1] ?? '').trim() || PAGE_URL
			});
		}
	}

	if (companies.length === 0) {
		throw new Error('earlylight: no companies on the portfolio page');
	}

	return companies;
}
