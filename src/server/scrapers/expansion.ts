import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://expansion-vc.eu/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, the whole collection on the one page: every card is a link to the
// company's site, naming it in a heading, with a line about it, a badge
// saying whether the fund is still in — "Active" or "Exited" — and the year
// the company was founded, which lies before the fund itself for the older
// ones. nothing files a company under a sector.

const ITEM = /(?=<div[^>]*role="listitem"[^>]*class="[^"]*w-dyn-item)/;
const SITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*class="[^"]*\bportfolio-card/;
const NAME = /<h\d class="display-5"[^>]*>([\s\S]*?)<\/h\d>/;
const BADGE = /class="badge[^"]*"[^>]*>\s*(?:<div[^>]*>)?\s*([\s\S]*?)\s*<\/div>/;
const FOUNDED = /<div class="text-paragraph">\s*((?:19|20)\d{2})\s*<\/div>/;
const EXIT = /^exit(ed)?$/i;
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
		const founded = item.match(FOUNDED)?.[1];
		companies.push({
			name,
			category: [
				founded ? `Founded ${founded}` : '',
				// "Active" says nothing; any other badge is kept
				/^active$/i.test(badge) || EXIT.test(badge) ? '' : badge,
				EXIT.test(badge) ? 'Exited' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: unescape(item.match(SITE)?.[1] ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('expansion: no companies on the portfolio page');
	}

	return companies;
}
