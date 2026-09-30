import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.bonfirevc.com/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the companies page holds three tabs of cards, served whole —
// "Active", "Acquired / IPO" and "Bonfire Family", the last the companies
// the fund counts as its own without a card's worth of detail. a card is
// the name, the industry ("Future of Work") and stage ("Early Stage",
// "Growth") the filters read, a line about the company and, folded away,
// its founders, its place, the year the fund partnered with it and its
// links, "Website" among them. a card on the acquired tab says how it
// went in place of its line — "Acquired by Google", "IPO", or once only
// the buyer's name — and is an exit. above the tabs a few of the same
// companies are featured again for their "Why We Invested" pieces, which
// are passed over.

const ITEM = /(?=<div\b[^>]*\brole="listitem"[^>]*\bclass="(?:active-companies|acquiredipo|bonfirefamily)-item w-dyn-item")/;
const LIST = /\bclass="(active-companies|acquiredipo|bonfirefamily)-item w-dyn-item"/;
const NAME = /class="paragraph-3xl company-name"[^>]*>([\s\S]*?)<\/div>/;
const INDUSTRY = /class="company-industry[^"]*"[^>]*>([\s\S]*?)<\/div>/;
const STAGE = /class="company-stage[^"]*"[^>]*>([\s\S]*?)<\/div>/;
const NOTE = /class="company-description-wrapper acquired">\s*<div class="paragraph-base">([\s\S]*?)<\/div>/;
const PARTNERED = /<h6\b[^>]*>\s*partnered\s*<\/h6>\s*<p\b[^>]*>([\s\S]*?)<\/p>/i;
const SITE = /<a\b[^>]*\bhref="([^"]*)"[^>]*>\s*<div>\s*Website\s*<\/div>/;
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
		const list = item.match(LIST)?.[1];
		const note = list === 'acquiredipo' ? tag(item.match(NOTE)?.[1] ?? '') : '';
		const year = clean(item.match(PARTNERED)?.[1] ?? '').match(/\b(?:19|20)\d{2}\b/)?.[0];
		const site = unescape(item.match(SITE)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [
				tag(item.match(INDUSTRY)?.[1] ?? ''),
				tag(item.match(STAGE)?.[1] ?? ''),
				year ? `Invested ${year}` : '',
				list === 'bonfirefamily' ? 'Bonfire Family' : '',
				note,
				list === 'acquiredipo' ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('bonfire: no companies on the companies page');
	}

	return companies;
}
