import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.future.africa/companies';
const MAX_PAGES = 20;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio is a collection of cards, fifteen to a page, which
// finsweet loads one under another; the pages are walked here through
// webflow's own "next" links. each card opens a popup naming the company,
// linking its site and listing the fund's facts for it — its status, where it
// is, its industry and the funds it was invested from ("Fund I & II"). "Full
// Exits" are the companies the fund is out of; "Partial Exits" are kept as
// the words, since the fund still holds some of them. a logo grid above the
// list repeats most of the companies under older names ("Andela Inc") and is
// not read.

const ITEM = /(?=<div[^>]*role="listitem"[^>]*class="[^"]*\bportco-collection-litem\b)/;
const NAME = /class="modal-company-name"[^>]*>([\s\S]*?)<\/div>/;
const STATUS = /fs-cmsfilter-field="Comp-Status"[^>]*>([\s\S]*?)<\/div>/;
const FACT = /<div class="portco-other-title">([^<]*)<\/div>\s*<div class="modal-status[^"]*">([\s\S]*?)<\/div>/g;
const SITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*class="portfolio-link"/;
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

// the places are typed by hand, some in lower case ("kenya")
const place = (s: string) => tag(s).replace(/(^|\s)([a-z])/g, (_, space, letter) => space + letter.toUpperCase());

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
			const facts = new Map(
				[...item.matchAll(FACT)].map(([, label, value]) => [clean(label).replace(/:$/, ''), clean(value)])
			);
			const status = clean(item.match(STATUS)?.[1] ?? '') || (facts.get('Status') ?? '');
			companies.push({
				name,
				category: [
					tag(facts.get('Industry') ?? ''),
					place(facts.get('Location') ?? ''),
					tag(facts.get('Fund(s) Invested from') ?? ''),
					/^partial/i.test(status) ? 'Partial exit' : '',
					/^full/i.test(status) ? 'Exited' : ''
				]
					.filter((t, i, all) => t && all.indexOf(t) === i)
					.join(', '),
				url: unescape(item.match(SITE)?.[1] ?? '')
			});
		}

		const next = html.match(NEXT)?.[1];
		url = next ? `${PAGE_URL}${unescape(next)}` : '';
	}

	if (companies.length === 0) {
		throw new Error('futureafrica: no companies in the portfolio list');
	}

	return companies;
}
