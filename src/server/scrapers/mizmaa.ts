import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.mizmaa.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, one page, everything on it. a card carries the company's name, the
// sector the fund files it under and a mark for one it no longer holds, and
// the panel that slides out beside it carries the address and the year the
// company was founded. so nothing has to be fetched twice.
//
// two of the twenty-seven cards are named Stealth, and their panels say only
// "In stealth mode" and a year. a company that has not been announced is not a
// newcomer to publish, and taking both would have left one of them anyway,
// since they answer to the same name.
//
// the year is a fact about the company rather than a label to file it under,
// and the fund gives no other, so the category is the sector and, where it
// applies, the word the fund uses for a company that has gone.

const CARD = /<div role="listitem" class="portfolio-cards w-dyn-item">([\s\S]*?)(?=<div role="listitem" class="portfolio-cards w-dyn-item">|$)/g;
const NAME = /class="name-caption">([\s\S]*?)<\/div>/;
const SECTOR = /fs-cmsfilter-field="sector"[^>]*>([\s\S]*?)<\/div>/g;
const SOLD = /class="div-block-40([^"]*)"[^>]*>\s*<div[^>]*>([\s\S]*?)<\/div>/;
const SITE = /href="(https?:\/\/[^"]+)"/g;
// webflow leaves a field in place and hides it when it has nothing to say
const HIDDEN = /w-condition-invisible/;
// the fund's own addresses, and the ones its images are served from
const NOT_A_COMPANY = /\/\/(?:[a-z0-9-]+\.)*(?:mizmaa\.com|website-files\.com|webflow\.com)\b/i;
// a company the fund has not named yet
const UNNAMED = /^stealth$/i;

const clean = (s: string) =>
	s
		.replace(/<[^>]+>/g, ' ')
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;|&#8220;|&#8221;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, card] of html.matchAll(CARD)) {
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || UNNAMED.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const sold = card.match(SOLD);
		const site = [...card.matchAll(SITE)]
			.map((link) => link[1])
			.find((link) => !NOT_A_COMPANY.test(link));

		companies.push({
			name,
			category: [
				...[...card.matchAll(SECTOR)].map((sector) => clean(sector[1])),
				sold && !HIDDEN.test(sold[1]) ? clean(sold[2]) : ''
			]
				.filter(Boolean)
				.join(', '),
			url: site ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('mizmaa: no companies in the portfolio grid');
	}

	return companies;
}
