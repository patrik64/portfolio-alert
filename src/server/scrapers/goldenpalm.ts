import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.gpalminvestments.org/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wix, rendered on the server: the portfolio is a matrix gallery of logos,
// each linking the company's site with its name for a title and, for one
// the fund is out of, "(Exited)" for a description. the text boxes beside
// the gallery repeat the companies with a line about each and are not read.

const ITEM = /(?=<div[^>]*class="[^"]*\bwixui-gallery__item\b)/;
const TITLE = /data-testid="gallery-item-title"[^>]*>([\s\S]*?)<\/div>/;
const LOGO = /<img\b[^>]*\balt="([^"]+)"/;
const NOTE = /data-testid="gallery-item-description"[^>]*>([\s\S]*?)<\/div>/;
const SITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
const EXIT = /\b(exit(ed)?|acquired|ipo)\b/i;
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
		// an item is its link; the last would otherwise run on into the footer
		const item = chunk.split('</a>')[0];
		const name = clean(item.match(TITLE)?.[1] || item.match(LOGO)?.[1] || '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			category: EXIT.test(clean(item.match(NOTE)?.[1] ?? '')) ? 'Exited' : '',
			url: unescape(item.match(SITE)?.[1] ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('goldenpalm: no companies in the portfolio gallery');
	}

	return companies;
}
