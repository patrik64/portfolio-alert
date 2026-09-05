import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://sentiero.vc/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress with a logo-grid plugin. each cell names the company under its logo
// and links out to it. two cells at the end of the grid are empty — the fund
// left them as spacers — and drop out for having no name.
//
// no sectors, no exits.

const ITEM = '<div class="smls-grid-pad-container">';
const NAME = /<div class="smls-overlay-title">\s*([^<]*?)\s*</;
const SITE = /<a class="smls-link-style" href="(https?:\/\/[^"]*)"/;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;/g, "'")
		.replace(/&amp;/g, '&')
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
	for (const item of html.split(ITEM).slice(1)) {
		const name = clean(item.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({ name, category: '', url: item.match(SITE)?.[1] ?? '' });
	}

	if (companies.length === 0) {
		throw new Error('sentiero: no companies on the portfolio page');
	}

	return companies;
}
