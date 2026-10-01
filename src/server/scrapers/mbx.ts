import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://mbxcapital.com/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a hand-written page: the home page's companies are one list, a to z,
// each a name linking the company's site, or the name alone where it has
// none, closed by a "+ more" that is not a company. nothing files a
// company under anything, and nothing marks an exit.

const MAIN = /<main\b[^>]*>([\s\S]*?)<\/main>/;
const LIST = /<ul\b[^>]*>([\s\S]*?)<\/ul>/;
const ITEM = /<li\b[^>]*>([\s\S]*?)<\/li>/g;
const HREF = /<a\b[^>]*\bhref="([^"]*)"/;
const MORE = /^\+/;
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
	const list = (html.match(MAIN)?.[1] ?? '').match(LIST)?.[1] ?? '';

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, item] of list.matchAll(ITEM)) {
		const name = clean(item);
		if (!name || MORE.test(name) || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const site = unescape(item.match(HREF)?.[1] ?? '').trim();
		companies.push({ name, category: '', url: /^https?:\/\//i.test(site) ? site : PAGE_URL });
	}
	if (companies.length === 0) {
		throw new Error('mbx: no companies in the list');
	}

	return companies;
}
