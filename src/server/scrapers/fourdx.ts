import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.4dxventures.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio page is a wall of logos, each with the industry
// the filter reads ("FinTech", "DeepTech / AI") and a panel served in the
// page — the logo again, named there in its alt text, a "Website" link,
// a line about the company and its facts: industry, the year founded and
// where it is ("hq"). "All" is the filter that shows everything. nothing
// marks an exit.

const ITEM = /(?=<div\b[^>]*\brole="listitem"[^>]*\bclass="portfolio-item w-dyn-item")/;
const NAME = /class="modal-top-bar">\s*<img\b[^>]*\balt="([^"]*)"/;
const INDUSTRY = /fs-cmsfilter-field="industries"[^>]*>([\s\S]*?)<\/div>/g;
const FACT = /<h5\b[^>]*\bclass="heading"[^>]*>([\s\S]*?)<\/h5>\s*<div>([\s\S]*?)<\/div>/g;
const SITE = /<a\b[^>]*\bhref="([^"]*)"[^>]*\bclass="modal-link\b[^"]*"[^>]*>[\s\S]*?<div class="modal-link-text">\s*Website\s*<\/div>/;
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
		const facts = new Map([...item.matchAll(FACT)].map(([, label, value]) => [clean(label).toLowerCase(), value]));
		const founded = clean(facts.get('founded') ?? '').match(/\b(?:19|20)\d{2}\b/)?.[0];
		const site = unescape(item.match(SITE)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [
				...[...item.matchAll(INDUSTRY)].map(([, label]) => tag(label)).filter((t) => !/^all$/i.test(t)),
				tag(facts.get('hq') ?? ''),
				founded ? `Founded ${founded}` : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('4dx: no companies on the portfolio page');
	}

	return companies;
}
