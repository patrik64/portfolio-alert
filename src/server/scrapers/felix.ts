import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.felixcap.com/home/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace: the home page shows the portfolio in two sections, the
// business companies ("New Ways of Working") and the consumer ones ("New
// Ways of Living"), each a pair of summary blocks headed "Featured", a
// company an item naming it and linking its site. the section is kept as a
// tag. the page says nothing of exits or years, and its collections hold more
// items than its blocks show, so the blocks — what the page shows — are
// what is read.

const SECTIONS: [string, string][] = [
	['b2bsection', 'B2B'],
	['consumer_section', 'Consumer']
];
// the markup breaks lines inside its tags, so whitespace is matched loosely
const ITEM = /(?=<div\s+class="\s*summary-item\s)/;
const TITLE = /<div\s+class="summary-title">\s*<a\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// a section of the page, from its opening tag up to the next section
function sectionOf(html: string, id: string): string {
	const at = html.indexOf(`id="${id}"`);
	if (at < 0) return '';
	const end = html.indexOf('<section', at + id.length);
	return html.slice(at, end < 0 ? html.length : end);
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [id, label] of SECTIONS) {
		const items = sectionOf(html, id).split(ITEM).slice(1);
		// were a section to move, half the portfolio would go quietly
		if (items.length === 0) {
			throw new Error(`felix: the home page has no companies in its ${label} section — the page moved`);
		}
		for (const item of items) {
			const [, href, title] = item.match(TITLE) ?? [];
			const name = clean(title ?? '');
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			const site = unescape(href ?? '').trim();
			companies.push({ name, category: label, url: /^https?:\/\//i.test(site) ? site : PAGE_URL });
		}
	}

	if (companies.length === 0) {
		throw new Error("felix: no company names in the home page's sections — the markup moved");
	}

	return companies;
}
