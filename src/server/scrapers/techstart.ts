import type { ScrapedCompany } from './types';

// the portfolio page shows a selection; its "See full portfolio" link is this
const PAGE_URL = 'https://www.techstart.vc/portfolio-list';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// framer: the full list is drawn into the page, a row a company with its
// logo and name, linking the company's site, and an exit marked by a badge
// in place of the logo (a layer named "Exit Wrapper"). the list is written
// out again for each screen size, so a company comes up more than once. a
// row named "Stealth" is passed over. an exit is kept with the Exited tag.

const ROW = /(?=<a\b[^>]*\bdata-framer-name="Row")/;
const SITE = /^<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
const NAME = /data-framer-name="Name"[^>]*>\s*<(div|h[1-6]|p)\b[^>]*>([\s\S]*?)<\/\1>/;
const EXIT = 'data-framer-name="Exit Wrapper"';
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
	for (const part of html.split(ROW).slice(1)) {
		const end = part.indexOf('</a>');
		const row = end < 0 ? part : part.slice(0, end);
		const name = clean(row.match(NAME)?.[2] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			category: row.includes(EXIT) ? 'Exited' : '',
			url: unescape(row.match(SITE)?.[1] ?? '').trim() || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('techstart: no companies on the portfolio list — the markup moved');
	}

	return companies;
}
