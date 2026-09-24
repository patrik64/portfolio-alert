import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.fjlabs.com/portfolio';
const MAX_PAGES = 60;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio is a collection a hundred to a page, walked through
// webflow's own "next" links. every row names the company and carries, as
// fields for finsweet's filters, whether it is exited, the stage and year the
// fund came in, its country, region and industry, and whether it is a
// marketplace. the name links nowhere ("#"), so a company comes without a
// site unless the row gives one.

const ITEM = /(?=<div[^>]*role="listitem"[^>]*class="[^"]*\bcollection-item\b)/;
const NAME = /fs-cmsfilter-field="Name"[^>]*>([\s\S]*?)<\/a>/;
const HREF = /fs-cmsfilter-field="Name"[^>]*\bhref="([^"]*)"|<a\b[^>]*\bhref="([^"]*)"[^>]*fs-cmsfilter-field="Name"/;
const field = (name: string) => new RegExp(`fs-cmsfilter-field="${name}"[^>]*>([\\s\\S]*?)<\\/div>`);
const EXITED = field('Exited');
const STAGE = field('Entry Stage');
const YEAR = field('Entry Year');
const GEOGRAPHY = field('Geography');
const INDUSTRY = field('Industry');
const MARKETPLACE = field('Marketplace');
const NEXT = /href="(\?[a-z0-9_]+_page=\d+)"[^>]*class="[^"]*w-pagination-next/;
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
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();

	let url = PAGE_URL;
	for (let page = 0; page < MAX_PAGES && url; page++) {
		const resp = await fetch(url, { headers: { 'User-Agent': UA } });
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${url}: ${resp.status}`);
		}
		const html = await resp.text();

		for (const item of html.split(ITEM).slice(1)) {
			const name = clean(item.match(NAME)?.[1] ?? '');
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			const href = unescape(item.match(HREF)?.slice(1).find(Boolean) ?? '');
			const year = clean(item.match(YEAR)?.[1] ?? '').match(/\b(?:19|20)\d{2}\b/)?.[0];
			companies.push({
				name,
				category: [
					tag(item.match(INDUSTRY)?.[1] ?? ''),
					/^yes$/i.test(clean(item.match(MARKETPLACE)?.[1] ?? '')) ? 'Marketplace' : '',
					tag(item.match(STAGE)?.[1] ?? ''),
					year ? `Invested ${year}` : '',
					tag(item.match(GEOGRAPHY)?.[1] ?? ''),
					/^true$/i.test(clean(item.match(EXITED)?.[1] ?? '')) ? 'Exited' : ''
				]
					.filter((t, i, all) => t && all.indexOf(t) === i)
					.join(', '),
				url: /^https?:\/\//.test(href) ? href : ''
			});
		}

		const next = html.match(NEXT)?.[1];
		url = next ? `${PAGE_URL}${unescape(next)}` : '';
	}

	if (companies.length === 0) {
		throw new Error('fjlabs: no companies in the portfolio list');
	}

	return companies;
}
