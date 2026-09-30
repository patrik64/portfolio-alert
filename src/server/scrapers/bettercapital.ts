import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.bettercapital.vc/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a site of the fund's own: the portfolio page is two tables — the
// companies, a row each with the name linking its site and a line about
// it, and the "Acquisitions", a row each with the name and how it went
// ("Acquired by Zaggle (NSE: ZAGGLE)"). above them the fund picks out a
// few notable companies a sector ("AI & Software", "Consumer"), by logo,
// and a company picked out there carries its sector.

const TABLE = /<table\b[^>]*>([\s\S]*?)<\/table>/g;
const HEAD = /<thead\b[^>]*>([\s\S]*?)<\/thead>/;
const ROW = /<tr\b[^>]*>\s*<td\b[^>]*>([\s\S]*?)<\/td>\s*<td\b[^>]*>([\s\S]*?)<\/td>/g;
const HREF = /<a\b[^>]*\bhref="([^"]*)"/;
const SECTION = /<h2>([\s\S]*?)<\/h2>|<div class="portfolio-logo-box">\s*<img\b[^>]*\balt="([^"]*)"/g;
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

	// the notable companies' sectors, by name as the logos are named
	const sectors = new Map<string, string>();
	let sector = '';
	for (const [, heading, alt] of html.matchAll(SECTION)) {
		if (heading !== undefined) sector = tag(heading);
		else if (sector && alt) sectors.set(clean(alt).toLowerCase(), sector);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, table] of html.matchAll(TABLE)) {
		const exits = /acquisitions/i.test(clean(table.match(HEAD)?.[1] ?? ''));
		for (const [, first, second] of table.matchAll(ROW)) {
			const name = clean(first);
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			const site = unescape(first.match(HREF)?.[1] ?? '').trim();
			// one row misspells it
			const outcome = exits ? tag(second).replace(/^acqu[a-z]*\s+by\b/i, 'Acquired by') : '';
			companies.push({
				name,
				category: [sectors.get(name.toLowerCase()) ?? '', outcome, exits ? 'Exited' : ''].filter(Boolean).join(', '),
				url: /^https?:\/\//i.test(site) ? site : PAGE_URL
			});
		}
	}
	if (companies.length === 0) {
		throw new Error('bettercapital: no companies in the portfolio tables');
	}

	return companies;
}
