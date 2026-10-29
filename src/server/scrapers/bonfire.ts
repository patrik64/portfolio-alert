import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.bonfirevc.com/companies';
const MAX_PAGES = 20;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: since october 2026 the companies page is one directory of
// accordions, twenty to a page, which finsweet loads one under another; the
// pages are walked here through webflow's own "next" links. an accordion
// opens on the company's founders, its industries ("Vertical AI",
// "FinTech"), the partner who leads it, its place, the year the fund
// partnered with it and its stage ("Early Stage", "Growth"), then its links,
// "Website" among them. hidden beside it are the filters' facts: its status
// — "Active", "Acquired", "IPO" or "Bonfire Family", the companies the fund
// counts as its own without the detail — and, for an exit, how it went
// ("Acquired by Google", "IPO", or once only the buyer's name). a carousel
// above the directory features a few of the same companies again for their
// "Why We Invested" pieces, and is passed over.

const ITEM = /(?=<div\b[^>]*\bfs-list-element="item"[^>]*\brole="listitem")/;
const NAME = /class="companies_directory_name"[^>]*>([\s\S]*?)<\/h3>/;
const INDUSTRY = /fs-list-field="industry"[^>]*>([\s\S]*?)<\/p>/g;
const STAGE = /fs-list-field="stage"[^>]*>([\s\S]*?)<\/p>/;
const PARTNERED = /fact-label">\s*partnered\s*<\/p>\s*<p\b[^>]*>([\s\S]*?)<\/p>/i;
const STATUS = /data-cms-value="status"[^>]*>([\s\S]*?)<\/p>/;
const NOTE = /data-cms-value="exit-note"[^>]*>([\s\S]*?)<\/p>/;
const SITE = /<a\b[^>]*\bdata-company-link="website"[^>]*\bhref="([^"]*)"/;
const NEXT = /href="(\?[a-z0-9_]+_page=\d+)"[^>]*class="[^"]*w-pagination-next/;
const EXIT = /^(acquired|ipo)$/i;
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
			const status = clean(item.match(STATUS)?.[1] ?? '');
			const exited = EXIT.test(status);
			const year = clean(item.match(PARTNERED)?.[1] ?? '').match(/\b(?:19|20)\d{2}\b/)?.[0];
			const site = unescape(item.match(SITE)?.[1] ?? '').trim();
			companies.push({
				name,
				category: [
					...[...item.matchAll(INDUSTRY)].map(([, industry]) => tag(industry)),
					tag(item.match(STAGE)?.[1] ?? ''),
					year ? `Invested ${year}` : '',
					/^bonfire family$/i.test(status) ? 'Bonfire Family' : '',
					exited ? tag(item.match(NOTE)?.[1] ?? '') || status : '',
					exited ? 'Exited' : ''
				]
					.filter((t, i, all) => t && all.indexOf(t) === i)
					.join(', '),
				url: /^https?:\/\//i.test(site) ? site : PAGE_URL
			});
		}

		const next = html.match(NEXT)?.[1];
		url = next ? `${PAGE_URL}${unescape(next)}` : '';
	}

	if (companies.length === 0) {
		throw new Error('bonfire: no companies on the companies page');
	}

	return companies;
}
