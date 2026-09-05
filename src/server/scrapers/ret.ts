import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.ret.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// static webflow with a finsweet filter over one collection list, so the whole
// portfolio is in the markup and the filters only hide cards. each card holds a
// panel that opens under the logo: the company's name, what it does, the year
// the fund invested, the stage it invested at, the property types the company
// serves, and a link to its site.
//
// the property types are the sector, read out of the extras row the fund
// headed "real estate focus" rather than off the filter attributes — the two
// newest companies were added without any filter values and would otherwise
// come through bare. every card also carries a hidden "all" placeholder the
// filter script reads, which is not a value the fund published.
//
// the status a card sets is how the investment ended; only companies the fund
// still holds are "active", which says nothing, so it is dropped and the rest
// are kept as the fund words them.

const CARD = '<div role="listitem" class="portfolio_grid_card w-dyn-item">';
const NAME = /class="portfolio_detail_heading[^"]*">([^<]*)</;
const SITE = /<a href="(https?:\/\/[^"]*)"[^>]*class="portfoilio_link w-inline-block"/;
// the placeholder the filter reads carries a class, the company's own status does not
const STATUS = /<div fs-cmsfilter-field="status">([^<]*)<\/div>/;
const EXTRA = /class="featured_extras_item"/;
const HEADING = /class="featured_extras_heading">([^<]*)</;
const VALUE = /class="featured_extras_text[^"]*">([^<]*)</g;
const FOCUS = 'real estate focus';
// the property type for a company that fits none of the fund's own
const NO_TYPE = 'other';
// the status of an investment the fund still holds
const HELD = 'active';

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
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
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of html.split(CARD).slice(1)) {
		const name = clean(card.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name)) continue;
		seen.add(name);

		const tags: string[] = [];
		for (const row of card.split(EXTRA).slice(1)) {
			if (clean(row.match(HEADING)?.[1] ?? '').toLowerCase() !== FOCUS) continue;
			for (const m of row.matchAll(VALUE)) {
				const tag = clean(m[1]);
				if (tag && tag.toLowerCase() !== NO_TYPE && !tags.includes(tag)) tags.push(tag);
			}
		}

		const status = clean(card.match(STATUS)?.[1] ?? '');
		if (status && status.toLowerCase() !== HELD) tags.push(status);

		companies.push({
			name,
			category: tags.join(', '),
			url: card.match(SITE)?.[1] ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('ret: no companies on the portfolio page');
	}

	return companies;
}
