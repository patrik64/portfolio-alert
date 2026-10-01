import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.acrewcapital.com/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the companies page is one list of logos, served whole, each
// named in its alt text and linking the company's site, with the fields
// the filters read hidden beside it: the thesis ("Fintech", "Data &
// Security"), the horizontal ("AI & ML") and the stage ("Early",
// "Growth"), all kept as tags. nothing marks an exit.

const LIST = 'collection-companies_list';
const ITEM = /(?=<div\b[^>]*\brole="listitem"[^>]*\bclass="w-dyn-item")/;
const LINK = /<a\b[^>]*\bhref="([^"]*)"/;
const ALT = /<img\b[^>]*\balt="([^"]*)"/;
const FIELD = /fs-cmsfilter-field="(thesis|horizontals|stages)"[^>]*>([\s\S]*?)<\/div>/g;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const at = html.indexOf(LIST);
	if (at < 0) {
		throw new Error('acrew: no list of companies on the companies page');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const chunk of html.slice(at).split(ITEM).slice(1)) {
		// an item ends with its link
		const item = chunk.slice(0, chunk.indexOf('</a>') + 1 || undefined);
		const name = clean(item.match(ALT)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const site = unescape(item.match(LINK)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [...item.matchAll(FIELD)]
				.map(([, , value]) => tag(value))
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('acrew: no companies on the companies page');
	}

	return companies;
}
