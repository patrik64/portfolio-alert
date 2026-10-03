import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://fintechv.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a static site, since the fund left squarespace (and its www address with
// it): the portfolio is a gallery of logos, each linking the company's site
// and naming it in its label, with a caption only where the fund has
// something to say — "Acquired by Neuberger Berman" — which is kept with the
// Exited tag.

// the squarespace gallery named no one, so the companies were stored under
// the names their sites give themselves; where the fund's label differs, the
// stored name is kept, since a moved name would read as a newcomer
const STORED_AS: Record<string, string> = {
	'Vero Technologies': 'Vero'
};

const COMPANY = /(?=<article\b[^>]*\bclass="portfolio-company\b)/;
const LINK = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
const LABEL = /<a\b[^>]*\baria-label="([^"]*)"/;
const ALT = /<img\b[^>]*\balt="([^"]*)"/;
const CAPTION = /class="portfolio-caption"[^>]*>([\s\S]*?)<\/p>/;
const EXIT = /^(acquired|merged|ipo|listed|exited)\b/i;

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
	for (const item of html.split(COMPANY).slice(1)) {
		const url = unescape(item.match(LINK)?.[1] ?? '').trim();
		const label = clean(item.match(LABEL)?.[1] ?? '') || clean(item.match(ALT)?.[1] ?? '');
		const name = STORED_AS[label] ?? label;
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const caption = tag(item.match(CAPTION)?.[1] ?? '');
		companies.push({
			name,
			category: caption ? (EXIT.test(caption) ? `${caption}, Exited` : caption) : '',
			url
		});
	}

	if (companies.length === 0) {
		throw new Error('fintechv: no companies in the portfolio gallery');
	}

	return companies;
}
