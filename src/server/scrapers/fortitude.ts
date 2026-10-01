import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://fortitudevc.com/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a hand-written page: the home page's "Portfolio Companies" section is a
// timeline, each entry naming the company in a link to its site over a
// line about it. nothing files a company under anything, and nothing marks
// an exit.

const SECTION = /<section\b[^>]*\bid="investments"[^>]*>([\s\S]*?)<\/section>/;
const ITEM = /<li\b[^>]*\bclass="timeline-item"[^>]*>([\s\S]*?)<\/li>/g;
const NAME = /class="timeline-name"[^>]*>([\s\S]*?)<\/div>/;
const HREF = /<a\b[^>]*\bhref="([^"]*)"/;
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
	const section = html.match(SECTION)?.[1] ?? '';

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, item] of section.matchAll(ITEM)) {
		const cell = item.match(NAME)?.[1] ?? '';
		const name = clean(cell);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const site = unescape(cell.match(HREF)?.[1] ?? '').trim();
		companies.push({ name, category: '', url: /^https?:\/\//i.test(site) ? site : PAGE_URL });
	}
	if (companies.length === 0) {
		throw new Error('fortitude: no companies in the portfolio section');
	}

	return companies;
}
