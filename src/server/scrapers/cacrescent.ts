import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.cacrescentfund.com/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, a single page: the portfolio section is a list of cards, each an
// emoji, the company's name and a line about it, linking the company's site.
// a company still in stealth is a card named "Stealth" linking nowhere and is
// passed over. the team below is a second list of the same kind, so only the
// cards inside the portfolio section are read.

const SECTION = /<section\b[^>]*\bid="portfolio"[^>]*>([\s\S]*?)<\/section>/;
const ROW = /(?=<div\b[^>]*\brole="listitem")/;
const NAME = /<div class="text-block-3">([\s\S]*?)<\/div>/;
const SITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
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
	for (const row of section.split(ROW).slice(1)) {
		const name = clean(row.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			category: '',
			url: unescape(row.match(SITE)?.[1] ?? '').trim() || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('cacrescent: no companies in the portfolio section — the markup moved');
	}

	return companies;
}
