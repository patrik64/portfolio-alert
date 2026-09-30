import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://carbonsilicon.vc/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a single page written by hand: the portfolio is one list, each company
// its name linked to its site, a line about it and now and then a link to
// the press; a company the fund is out of says "(Acquired)" beside its
// name. a company not yet announced stands in the list as a description,
// "Cloud Lab Company (TBA)", linking nowhere; those are left out, to be
// picked up under their own names.

const ITEM = /<li\b[^>]*\bclass="portfolio-item\b[^"]*"[^>]*>([\s\S]*?)<\/li>/g;
const COMPANY = /\bdata-company="([^"]*)"/;
// the name's link comes first, before any link to the press
const LINK = /<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/;
const ACQUIRED = /class="acquired"/;
const PENDING = /class="tba"/;
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
	for (const [, item] of html.matchAll(ITEM)) {
		if (PENDING.test(item)) continue;
		const link = item.match(LINK);
		const name = clean(item.match(COMPANY)?.[1] ?? '') || clean(link?.[2] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const site = unescape(link?.[1] ?? '').trim();
		const acquired = ACQUIRED.test(item);
		companies.push({
			name,
			category: acquired ? 'Acquired, Exited' : '',
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('carbonsilicon: no companies on the page');
	}

	return companies;
}
