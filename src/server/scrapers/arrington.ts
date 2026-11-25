import type { ScrapedCompany } from './types';

// www. sends its visitors to the bare domain, and /portfolio/ to /portfolio
const PAGE_URL = 'https://arringtoncapital.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a site of the fund's own, rendered on the server, since the rebuild first
// seen on 2026-11-24: the portfolio page no longer lists the portfolio, only "some
// portfolio highlights selected to show some of the categories we have
// invested in" (the fund says it has backed 300+). each highlight is a card,
// the company's logo linking its site and named in the link's label, with
// links to its site and its x account under it. nothing names a category or
// marks an exit, so a company comes with nothing to file it under.
//
// the companies the old page listed and the highlights leave out stay stored
// as they were; a company is new only when the fund adds it to the highlights.
// a highlight named otherwise than the old page named it is kept under the name
// it was stored as, so it is not taken for a new company.
const STORED_AS: Record<string, string> = {
	'domain money': 'Domain',
	sui: 'Sui by Mysten Labs'
};

const CARD = /(?=<div\b[^>]*\bclass="group flex flex-col\b)/;
const LOGO = /<a\b([^>]*)>\s*<img\b[^>]*\balt="([^"]*)"/;
const LABEL = /\baria-label="([^"]*)"/;
const SITE = /\bhref="(https?:\/\/[^"]+)"/;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const card of html.split(CARD).slice(1)) {
		const logo = card.match(LOGO);
		if (!logo) continue;
		const [, attrs, alt] = logo;
		const written = clean(attrs.match(LABEL)?.[1] ?? '') || clean(alt);
		const name = STORED_AS[written.toLowerCase()] ?? written;
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const site = unescape(attrs.match(SITE)?.[1] ?? '').trim();
		companies.push({ name, category: '', url: site || PAGE_URL });
	}
	if (companies.length === 0) {
		throw new Error('arrington: no companies on the portfolio page');
	}

	return companies;
}
