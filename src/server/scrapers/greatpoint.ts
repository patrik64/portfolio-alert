import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.gpv.com/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, the whole collection on the one page: every company is a logo,
// whose alt text names it, linking its site — or "#", for one that has none
// left — beside a line about it. the line says, just after the name, how a
// company the fund is out of went: "BeyondCore (acquired by Salesforce)",
// "Beyond Meat (IPO: BYND)"; that is kept, with the Exited tag. a name can
// carry a note of an older one — "Tensordyne (formerly Recogni)" — which is
// not part of it.

const ITEM = /(?=<div[^>]*role="listitem"[^>]*class="[^"]*w-dyn-item)/;
const NAME = /<img\b[^>]*\balt="([^"]+)"[^>]*class="company__logo-img/;
// the line opens with the name in bold, should the logo lose its alt text
const BOLD = /<strong>([\s\S]*?)<\/strong>/;
const LINK = /<a\b[^>]*\bhref="([^"]*)"/;
const LINE = /class="company__text\b[^"]*"[^>]*>([\s\S]*?)<\/div>/;
const OUTCOME = /\(((?:acquired|merged)\b[^)]*|ipo\b[^)]*)\)/i;
const FORMERLY = /\s*\((?:formerly|fka|f\.k\.a\.)\s[^)]*\)\s*/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a note holding a comma would read as two
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
		const line = item.match(LINE)?.[1] ?? '';
		const name = clean(item.match(NAME)?.[1] || line.match(BOLD)?.[1] || '')
			.replace(FORMERLY, ' ')
			.replace(/'s$/, '')
			.trim();
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const outcome = tag(clean(line).match(OUTCOME)?.[1] ?? '');
		const link = unescape(item.match(LINK)?.[1] ?? '');
		companies.push({
			name,
			category: outcome ? `${outcome[0].toUpperCase()}${outcome.slice(1)}, Exited` : '',
			// "#" for a company with no site left
			url: /^https?:\/\//.test(link) ? link : ''
		});
	}

	if (companies.length === 0) {
		throw new Error('greatpoint: no companies on the companies page');
	}

	return companies;
}
