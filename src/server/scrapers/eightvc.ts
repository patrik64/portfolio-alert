import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.8vc.com/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the companies page is a wall of cards served whole — a logo
// named in its alt text, a line about the company, and as hidden fields
// the name and the stage the filter reads ("Series A", "Series C+", and
// "Exited" for the ones the fund is out of). a card links the company's
// page on the fund's site, its own site, and its social pages. the
// industries are fetched card by card by the page's script from those
// pages, and are not read here.

const CARD = /(?=<div\b[^>]*\brole="listitem"[^>]*\bclass="companies-collection_item w-dyn-item")/;
const NAME = /fs-cmsfilter-field="name"[^>]*>([\s\S]*?)<\/div>/;
const ALT = /<img\b[^>]*\bclass="company-logo_image"[^>]*\balt="([^"]*)"/;
const STAGE = /fs-cmsfilter-field="stage"[^>]*>([\s\S]*?)<\/div>/;
const LINK = /<a\b[^>]*\bhref="([^"]*)"[^>]*\bclass="card-link\b/g;
const SOCIAL = /linkedin\.com|twitter\.com|x\.com|8vc\.com/i;
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
	for (const card of html.split(CARD).slice(1)) {
		const name = clean(card.match(NAME)?.[1] ?? '') || clean(card.match(ALT)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const stage = tag(card.match(STAGE)?.[1] ?? '');
		const exited = /^exited$/i.test(stage);
		const site =
			[...card.matchAll(LINK)].map(([, href]) => unescape(href).trim()).find((href) => /^https?:\/\//i.test(href) && !SOCIAL.test(href)) ??
			'';
		companies.push({
			name,
			category: [exited ? '' : stage, exited ? 'Exited' : ''].filter(Boolean).join(', '),
			url: site || PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('8vc: no companies on the companies page');
	}

	return companies;
}
