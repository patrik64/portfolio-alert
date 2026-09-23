import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://framework.ventures/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio page is a single list of the companies the fund
// shows, each a logo with its name under it and a link over the lot to the
// company's site; nothing files a company under anything or marks an exit.
// the "more complete list" the page points to, at /investments, is a column
// of legal names typed out by hand ("Anode Labs, Inc.", two of them run
// together into one line), with no sites, and is not read.

const ITEM = /(?=<div[^>]*role="listitem"[^>]*class="[^"]*w-dyn-item)/;
const NAME = /class="[^"]*\bportfolio_list_title\b[^"]*"[^>]*>([\s\S]*?)<\/div>/;
const SITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const chunk of html.split(ITEM).slice(1)) {
		// an item ends with its link; the last would otherwise run on into the footer
		const item = chunk.split('</a>')[0];
		const name = clean(item.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: '', url: unescape(item.match(SITE)?.[1] ?? '') });
	}

	if (companies.length === 0) {
		throw new Error('framework: no companies on the portfolio page');
	}

	return companies;
}
