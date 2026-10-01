import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://acre.vc/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a page written by hand: the home page's "Who we partner with" is a grid
// of logos, each named in its alt text over a line about the company and
// linking its site, with "Acquired" above the ones the fund is out of. the
// grid is written twice, for wide screens and narrow, and the narrow copy
// misspells a few names and links nothing, so the wide one is read.

const ITEM = /(?=<div class="investment-icons-desktop"[\s>])/;
const ALT = /<img\b[^>]*\balt="([^"]*)"/;
const LINK = /<a\b[^>]*\bhref="([^"]*)"/;
const ACQUIRED = /<div class="acquired\b[^"]*"[^>]*>\s*Acquired\s*<\/div>/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

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
		// an item runs to the end of its link
		const item = chunk.slice(0, chunk.indexOf('</a>') + 4 || undefined);
		const name = clean(item.match(ALT)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const site = unescape(item.match(LINK)?.[1] ?? '').trim();
		const out = ACQUIRED.test(item);
		companies.push({
			name,
			category: out ? 'Acquired, Exited' : '',
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('acre: no companies on the home page');
	}

	return companies;
}
