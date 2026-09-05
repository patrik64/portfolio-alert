import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://recvc.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js, server rendered. each company is a card holding its logo — named in
// the alt text, which is the only place the name is written — a line about the
// founders the fund backed, the sector, and links.
//
// a card links to the company's account on x, to the company itself, and then
// to each founder on x again, so the address is the first link that is not x.
//
// the fund files a third of its companies under no sector at all.

const ITEM = '<div class="founder-card';
const NAME = /alt="([^"]*)"/;
const LINK = /href="(https?:\/\/[^"]+)"/g;
const SECTOR = /<span>▪<\/span>\s*(?:<!--[^>]*-->)?\s*([^<]*)</;
// where the fund and its companies post, rather than a company's own address
const SOCIAL = /^https?:\/\/(?:www\.)?(?:x|twitter)\.com/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = (await resp.text()).replace(/\s+/g, ' ');

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const name = clean(item.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name)) continue;
		seen.add(name);

		companies.push({
			name,
			category: clean(item.match(SECTOR)?.[1] ?? ''),
			url: [...item.matchAll(LINK)].map((m) => m[1]).find((u) => !SOCIAL.test(u)) ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('recvc: no companies on the portfolio page');
	}

	return companies;
}
