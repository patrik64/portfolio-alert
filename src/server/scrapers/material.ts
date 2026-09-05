import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.materialimpact.com/companies/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress. the wall is logos, but the panel each one opens is written into
// the same page, so the names, the focus areas and the addresses are all there
// in one request. the fund's own api agrees on the count.
//
// the fund writes its focus areas more than one way — Biomanufacturing &
// Sustainable Products for four companies and Biomanufacturing & Sustainable
// Goods for four more, and three spellings of the robotics one, only some of
// which its own filter offers. they are kept as typed, since which spelling it
// means to keep is its own business.
//
// a panel also states where a company came from, but as a university's logo
// rather than as words, so there is nothing to read there.

const PANEL = /<div class="popout" id="popout-\d+">([\s\S]*?)(?=<div class="popout" id="popout-\d+">|$)/g;
const NAME = /<h3>([\s\S]*?)<\/h3>/;
const FOCUS = /<p class="focus-area">([\s\S]*?)<\/p>/;
// the fund puts the company's own address behind a globe, in a column it names
const SITE = /<div class="columns[^"]*\bweb">\s*<a href="([^"]*)"/;

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
	for (const [, panel] of html.matchAll(PANEL)) {
		const name = clean(panel.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const site = clean(panel.match(SITE)?.[1] ?? '');
		companies.push({
			name,
			category: clean(panel.match(FOCUS)?.[1] ?? ''),
			url: /^https?:\/\//i.test(site) ? site : ''
		});
	}

	if (companies.length === 0) {
		throw new Error('material: no companies behind the wall');
	}

	return companies;
}
