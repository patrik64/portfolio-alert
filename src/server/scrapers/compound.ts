import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.compound.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio is four lists, each under a heading that is the
// company's category — "Automation", "Healthcare & Biology", "Crypto" and
// "Other", the last saying nothing about a company and so left off it. an
// entry is a logo and the company's name, linked to its site. a company
// the fund has not announced stands in the list under a description of
// what it does ("Retail Robotics Co.") and links nowhere; those are left
// out, to be picked up under their own names when they are given one.
// nothing marks an exit.

const SECTION = /(?=<h2\b)/;
const HEADING = /<h2\b[^>]*>([\s\S]*?)<\/h2>/;
const ITEM = 'role="listitem"';
const NAME = /<h4\b[^>]*>([\s\S]*?)<\/h4>/;
const SITE = /<a\b[^>]*\bhref="([^"]*)"/;
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
	for (const section of html.split(SECTION).slice(1)) {
		const heading = tag(section.match(HEADING)?.[1] ?? '');
		for (const item of section.split(ITEM).slice(1)) {
			// an entry ends with its name; what follows the last of a list is not its own
			const named = item.match(NAME);
			if (!named) continue;
			const name = clean(named[1]);
			const site = unescape(item.slice(0, named.index).match(SITE)?.[1] ?? '').trim();
			if (!name || STEALTH.test(name) || !/^https?:\/\//i.test(site)) continue;
			if (seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			companies.push({ name, category: /^other$/i.test(heading) ? '' : heading, url: site });
		}
	}
	if (companies.length === 0) {
		throw new Error('compound: no companies on the portfolio page');
	}

	return companies;
}
