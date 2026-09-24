import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.floodgate.com/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, the whole collection on the one page: every card carries the
// sectors the page filters by, a badge for the companies the fund is out of
// ("M&A", "IPO"), and a popup naming the company with its industry and its
// site. "Other" is the sector that says nothing.

const ITEM = /(?=<div[^>]*role="listitem"[^>]*class="[^"]*\bcompany__item\b)/;
const NAME = /class="companies__name">([\s\S]*?)<\/div>/;
const FILTER = /class="company__filter-text">([^<]+)<\/div>/g;
const INDUSTRY = /class="companies__industry-text">([^<]*)<\/div>/;
const BADGE = /class="companies__tag-text">([^<]+)<\/div>/;
const SITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*class="modal__link"/;
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
	for (const item of html.split(ITEM).slice(1)) {
		const name = clean(item.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const badge = tag(item.match(BADGE)?.[1] ?? '');
		companies.push({
			name,
			category: [
				...[...item.matchAll(FILTER)].map((m) => tag(m[1])).filter((t) => !/^other$/i.test(t)),
				tag(item.match(INDUSTRY)?.[1] ?? ''),
				badge,
				badge ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: unescape(item.match(SITE)?.[1] ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('floodgate: no companies on the companies page');
	}

	return companies;
}
