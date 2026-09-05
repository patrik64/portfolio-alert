import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://m1c.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace, and the portfolio is an accordion rather than a grid: one row
// per company, opening on the category the fund files it under, where the
// company works, a line about it, and links to its site and its linkedin.
//
// the fund's category is written four different ways across thirty companies —
// Industrial Resilience, Industrial Resiliance, Industrial Resilence, and
// Energy Indepedence for Energy Independence. they are kept as typed rather
// than corrected to whichever spelling is commonest: which one the fund means
// to keep is its own business, and guessing would put a word here that is
// nowhere on its page.
//
// the site is the link the fund labels website, and not simply the first one,
// since a linkedin page follows it in every row. two companies have neither.

const ROW = /<li class="accordion-item"[^>]*>([\s\S]*?)<\/li>/g;
const NAME = /class="accordion-item__title">([\s\S]*?)<\/span>/;
const DESCRIPTION = /accordion-item__description[^>]*>([\s\S]*?)<\/div>/;
const PARAGRAPH = /<p[^>]*>([\s\S]*?)<\/p>/g;
const SITE = /<a[^>]*\bhref="([^"]*)"[^>]*>\s*<strong>\s*website\s*<\/strong>/i;
// the two things the fund states about a company, each on its own line
const STATED = /^(?:category|geography)\s*:\s*(.+)$/i;

const clean = (s: string) =>
	s
		.replace(/<[^>]+>/g, ' ')
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;|&#8220;|&#8221;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#0?38;|&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, row] of html.matchAll(ROW)) {
		const name = clean(row.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const said = row.match(DESCRIPTION)?.[1] ?? '';
		const site = clean(said.match(SITE)?.[1] ?? '');

		companies.push({
			name,
			category: [...said.matchAll(PARAGRAPH)]
				.map((paragraph) => clean(paragraph[1]).match(STATED)?.[1] ?? '')
				.filter(Boolean)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : ''
		});
	}

	if (companies.length === 0) {
		throw new Error('m1c: no companies in the portfolio accordion');
	}

	return companies;
}
