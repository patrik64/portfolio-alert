import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://gallery.vc/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// framer, a single page: the "Selected Portfolio" section is a list of names
// in two columns, drawn into the page in full ("See all" only lifts the fade
// over its lower half), and above it a few logos, each a link to its
// company's site named after the company. a name takes the link of the logo
// named the same; one without a logo links the fund's page.

const SECTION = /data-framer-name="portfolio_wrap"([\s\S]*?)data-framer-name="See all_blocker"/;
const LIST = 'data-framer-name="List_wrap"';
const NAME = /<h1\b[^>]*>([\s\S]*?)<\/h1>/g;
const LINK = /<a\b[^>]*>/g;
const LAYER = /\bdata-framer-name="([^"]*)"/;
const HREF = /\bhref="(https?:\/\/[^"]+)"/;
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
	const at = section.indexOf(LIST);
	const [logos, list] = at < 0 ? ['', ''] : [section.slice(0, at), section.slice(at)];

	// the logos' links by the company each is named after
	const sites = new Map<string, string>();
	for (const [a] of logos.matchAll(LINK)) {
		const layer = clean(a.match(LAYER)?.[1] ?? '').toLowerCase();
		const href = unescape(a.match(HREF)?.[1] ?? '').trim();
		if (layer && href && !sites.has(layer)) sites.set(layer, href);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, written] of list.matchAll(NAME)) {
		const name = clean(written);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: '', url: sites.get(name.toLowerCase()) ?? PAGE_URL });
	}

	if (companies.length === 0) {
		throw new Error('gallery: no companies in the portfolio list — the markup moved');
	}

	return companies;
}
