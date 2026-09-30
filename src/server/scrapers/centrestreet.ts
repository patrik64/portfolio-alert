import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://centrestreet.partners/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio is one list, each company its name, a line about
// it, the fund it sits in ("Fund I", "Fund II") and a link to its site.
// nothing marks an exit.

const ITEM = /(?=<div\b[^>]*\bclass="portfolio_item")/;
const NAME = /class="heading-style-h5"[^>]*>([\s\S]*?)<\/div>/;
const FUND = /class="portfolio_fund"[^>]*>([\s\S]*?)<\/div>/g;
const SITE = /<a\b[^>]*\bhref="([^"]*)"[^>]*\bclass="portfolio_link\b/;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const chunk of html.split(ITEM).slice(1)) {
		// an item ends with its link; what follows the last of them is not its own
		const linked = chunk.match(SITE);
		const item = linked ? chunk.slice(0, (linked.index ?? 0) + linked[0].length) : chunk;
		const name = clean(item.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const site = unescape(linked?.[1] ?? '').trim();
		companies.push({
			name,
			category: [...item.matchAll(FUND)]
				.map(([, fund]) => tag(fund))
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('centrestreet: no companies on the portfolio page');
	}

	return companies;
}
