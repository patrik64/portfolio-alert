import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://designerfund.com/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// framer, rendered on the server: every company is a box linking its site,
// drawn once per screen size, with the name, a line about it and a row of
// the category the fund files it under and where it is ("Design Tools |
// San Francisco"); under a heading "Acquired Companies" further down, the
// boxes for those the fund is out of carry the name and category alone.

const ACQUIRED = /<h2[^>]*>\s*Acquired Companies\s*<\/h2>/;
const BOX = /<a\b[^>]*\bdata-framer-name="Company Box2?"[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
const NAME = /data-framer-name="Company Name"[^>]*>[\s\S]*?<h\d[^>]*>([\s\S]*?)<\/h\d>/;
const FACT = /data-framer-name="(?:Location|Category)"[^>]*>\s*<p[^>]*>([\s\S]*?)<\/p>/g;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a place written "Brooklyn, NY" would
// read as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const cut = html.search(ACQUIRED);
	const parts: [html: string, exited: boolean][] =
		cut >= 0 ? [[html.slice(0, cut), false], [html.slice(cut), true]] : [[html, false]];

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [part, exited] of parts) {
		for (const [, href, body] of part.matchAll(BOX)) {
			const name = clean(body.match(NAME)?.[1] ?? '');
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			companies.push({
				name,
				category: [
					// the row reads "Design Tools | San Francisco", a bar between
					...[...body.matchAll(FACT)].map((m) => tag(m[1])).filter((t) => t && t !== '|'),
					exited ? 'Acquired' : '',
					exited ? 'Exited' : ''
				]
					.filter((t, i, all) => t && all.indexOf(t) === i)
					.join(', '),
				url: unescape(href).trim() || PAGE_URL
			});
		}
	}

	if (companies.length === 0) {
		throw new Error('designerfund: no companies on the companies page');
	}

	return companies;
}
