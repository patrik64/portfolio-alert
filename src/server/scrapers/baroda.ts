import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.barodaventures.com/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wix: the companies page is two galleries of logos with no heading to
// either, the first linking each company's site and the second linking
// nothing. every logo is named in its alt text, and the one the fund is
// out of says so there ("Retention Science Acquired"), which is taken off
// the name and kept as the mark. the fund files nothing else. a logo
// linking the fund's own site links nothing.

const ITEM = /(?=<div\b[^>]*\bclass="[^"]*\bwixui-gallery__item\b)/;
const ALT = /<img\b[^>]*\balt="([^"]*)"/;
const HREF = /<a\b[^>]*\bhref="([^"]*)"/;
const ACQUIRED = /\s+acquired\s*$/i;
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
		// an item ends at its image; the last runs on to the end of the page
		const item = chunk.slice(0, chunk.indexOf('</img>') + 1 || chunk.indexOf('/>', chunk.search(ALT)) + 2 || undefined);
		const written = clean(item.match(ALT)?.[1] ?? '');
		const acquired = ACQUIRED.test(written);
		const name = written.replace(ACQUIRED, '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const site = unescape(item.match(HREF)?.[1] ?? '').trim();
		companies.push({
			name,
			category: acquired ? 'Acquired, Exited' : '',
			url: /^https?:\/\//i.test(site) && !/barodaventures\.com/i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('baroda: no companies in the galleries');
	}

	return companies;
}
