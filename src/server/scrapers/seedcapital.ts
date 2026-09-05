import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.seedcapital.dk/our-family';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// static webflow, the whole list in the html. each row names the company —
// twice, in a heading webflow hides and in the logo's alt text — files it under
// a sector, and links to it.
//
// a second field records how the fund's holding ended: "Exit", "IPO", or
// "Legacy" for the older book. the first two are exits and are written as such;
// the third is kept as the fund writes it.
//
// webflow leaves the unused fields in place as empty divs, so only the ones
// with text count. the year beside them is when the fund invested, which is
// about the fund rather than the company.

const ITEM = 'role="listitem" class="portco-item w-dyn-item"';
const NAME = /<h3[^>]*class="text-size-h4[^"]*">([^<]*)<\/h3>/;
const NAME_ALT = /<img alt="([^"]*)"[^>]*class="portco-logo"/;
const CATEGORY = /fs-cmsfilter-field="category"[^>]*>([^<]*)<\/div>/g;
const INVESTMENT = /fs-cmsfilter-field="investment"[^>]*>([^<]*)<\/div>/g;
const SITE = /href="(https?:\/\/[^"]*)"/;
const LEFT = /^(exit|ipo)$/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&amp;/g, '&')
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
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const name = clean(item.match(NAME)?.[1] ?? item.match(NAME_ALT)?.[1] ?? '');
		if (!name || seen.has(name)) continue;
		seen.add(name);

		const sectors = [...item.matchAll(CATEGORY)].map((m) => clean(m[1])).filter(Boolean);
		const standing = [...item.matchAll(INVESTMENT)]
			.map((m) => clean(m[1]))
			.filter(Boolean)
			.map((s) => (LEFT.test(s) ? 'Exited' : s));

		companies.push({
			name,
			category: [...new Set([...sectors, ...standing])].join(', '),
			url: item.match(SITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('seedcapital: no companies on the portfolio page');
	}

	return companies;
}
