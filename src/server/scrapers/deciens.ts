import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://deciens.com/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace: the companies page is a gallery, a figure per company —
// its logo linking its site, the name in the caption beneath. the page
// files companies under nothing and marks no exit.

const FIGURE = /(?=<figure\b[^>]*class="gallery-grid-item\b)/;
const LINK = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*class="[^"]*\bgallery-grid-image-link\b/;
const CAPTION = /class="gallery-caption-content"[^>]*>([\s\S]*?)<\/p>/;
const ALT = /<img\b[^>]*\balt="([^"]+)"/;
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
	for (const chunk of html.split(FIGURE).slice(1)) {
		const figure = chunk.split('</figure>')[0];
		const name = clean(figure.match(CAPTION)?.[1] ?? '') || clean(figure.match(ALT)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: '', url: unescape(figure.match(LINK)?.[1] ?? '').trim() || PAGE_URL });
	}

	if (companies.length === 0) {
		throw new Error('deciens: no companies on the companies page');
	}

	return companies;
}
