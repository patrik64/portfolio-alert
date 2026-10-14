import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://expon.capital/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// framer: the portfolio page is a grid of cards, the whole of it in the
// page, a card a company with its picture, its status ("Active", "Exited",
// "Inactive"), the year the fund invested ("Invested in 2021") and its
// name. the page's filters by fund and sector are drawn in the browser and
// the cards say neither; a card links nowhere, so every company links the
// page. the year is kept as a tag, an exit with the Exited tag and a
// company no longer running with the Closed tag.

// a card's three layers, in the order the card writes them
const CARD =
	/data-framer-name="Status"[^>]*>([\s\S]*?)<\/div>\s*<div\b[^>]*data-framer-name="Date"[^>]*>([\s\S]*?)<\/div>\s*<div\b[^>]*data-framer-name="Name"[^>]*>([\s\S]*?)<\/div>/g;
const YEAR = /\b(?:19|20)\d{2}\b/;
const EXITED = /^exited$/i;
const INACTIVE = /^inactive$/i;
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
	for (const [, statusHtml, dateHtml, nameHtml] of html.matchAll(CARD)) {
		const name = clean(nameHtml);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const status = clean(statusHtml);
		const year = clean(dateHtml).match(YEAR)?.[0];
		companies.push({
			name,
			category: [
				year ? `Invested ${year}` : '',
				EXITED.test(status) ? 'Exited' : INACTIVE.test(status) ? 'Closed' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('expon: no companies on the portfolio page — the markup moved');
	}

	return companies;
}
