import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.radiancapital.com/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// static webflow. the grid shows logos and a line about each company; the name
// is in the popup behind the logo, along with the theme the fund files it
// under, how the investment stands and a link to the company.
//
// "current investment" is every company the fund still holds; the five that
// have left say who bought them, and that is worth keeping as the fund words
// it.

const ITEM = 'role="listitem" class="companies_item w-dyn-item">';
const NAME = /<h3 class="heading-style-h4 is-mobile-h4">([^<]*)<\/h3>/;
const STATUS = /text-size-large text-size-large-company-popup">([^<]*)</;
const THEME = /text-size-small-company-popup">Theme<\/div><div class="text-size-small">([^<]*)</;
const SITE = /href="(https?:\/\/[^"]*)" class="button /;
// the status of a company the fund still holds
const HELD = /^current investment$/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = (await resp.text()).replace(/\s+/g, ' ');

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const name = clean(item.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name)) continue;
		seen.add(name);

		const status = clean(item.match(STATUS)?.[1] ?? '');
		companies.push({
			name,
			category: [clean(item.match(THEME)?.[1] ?? ''), HELD.test(status) ? '' : status]
				.filter(Boolean)
				.join(', '),
			url: item.match(SITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('radian: no companies on the companies page');
	}

	return companies;
}
