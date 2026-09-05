import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.moxxie.vc/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, one page, and the portfolio is written into it whole. twelve of the
// sixty-nine are shown again in a strip at the top, which is the fund putting
// its best known first rather than a second list, so only the grid is read.
//
// the fund keeps its filter values in a nested collection hidden beside each
// logo, one word per company — Enterprise, Healthcare, Infra, Climate,
// Consumer, Vertical AI, FinTech — and that is the category here.
//
// a company that has been bought carries a badge webflow leaves in the markup
// either way, marked invisible where it does not apply; six are visible today.
// two of those six have a # where their address should be, their sites having
// gone with them, and they keep no address rather than a link to nowhere.
//
// the fund misspells its own class names — logo-coloection_name and
// logo-coloection_aquired — and those are copied as they are, since they are
// what the page actually says.

const ITEM = /<div[^>]*role="listitem" class="logo-collection_item w-dyn-item">([\s\S]*?)(?=<div[^>]*role="listitem" class="logo-collection_item w-dyn-item">|$)/g;
const NAME = /class="logo-coloection_name">([\s\S]*?)<\/div>/;
const ALT = /<img\b[^>]*?\balt="([^"]*)"/;
const SITE = /<a\b[^>]*?\bhref="([^"]*)"/;
const CATEGORY = /fs-list-field="category">([\s\S]*?)<\/div>/g;
const SOLD = /class="logo-coloection_aquired([^"]*)"[^>]*>([\s\S]*?)<\/div>/;
// webflow leaves a field in place and hides it when it has nothing to say
const HIDDEN = /w-condition-invisible/;

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
	for (const [, item] of html.matchAll(ITEM)) {
		const name = clean(item.match(NAME)?.[1] ?? '') || clean(item.match(ALT)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const sold = item.match(SOLD);
		const site = item.match(SITE)?.[1] ?? '';
		companies.push({
			name,
			category: [
				...[...item.matchAll(CATEGORY)].map((category) => clean(category[1])),
				sold && !HIDDEN.test(sold[1]) ? clean(sold[2]) : ''
			]
				.filter(Boolean)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : ''
		});
	}

	if (companies.length === 0) {
		throw new Error('moxxie: no companies in the portfolio grid');
	}

	return companies;
}
