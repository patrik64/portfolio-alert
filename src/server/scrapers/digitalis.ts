import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.digitalisventures.com';
// the fund's two portfolios, a page each, tagged with their names
const PAGES: [path: string, segment: string][] = [
	['/human-health', 'Human Health'],
	['/animal-health', 'Animal Health']
];
const PAGE_URL = `${BASE_URL}${PAGES[0][0]}`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: each portfolio page folds its companies into dropdowns headed
// with the name — starred on one sold — that open onto a line about the
// company and its site on the left, and on the right its location, its
// founders and, for the starred, how it went: "* Acquired by Renaissance".

const DROPDOWN = /(?=<div[^>]*class="venture-dropdown w-dropdown")/;
const NAME = /class="company-name"[^>]*>([\s\S]*?)<\/h\d>/;
const LEFT = /class="venture-rich w-richtext"[^>]*>([\s\S]*?)<\/div>/;
const RIGHT = /class="venture-rich-right w-richtext"[^>]*>([\s\S]*?)<\/div>/;
const LINK = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
// the place follows its label in the next paragraph, or after a line break
// inside the same one
const LOCATION = /<strong>\s*LOCATION[\s\S]*?<\/strong>(?:\s|\u200d|&nbsp;|<\/p>|<p[^>]*>|<br\s*\/?>)*([^<]+)/i;
const OUTCOME = /\*\s*((?:acquired|merged|exited|ipo)\b[^<]*)/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;|‍/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a place written "Boston, MA" would read
// as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [path, segment] of PAGES) {
		const html = await fetchText(`${BASE_URL}${path}`);
		for (const dropdown of html.split(DROPDOWN).slice(1)) {
			const heading = clean(dropdown.match(NAME)?.[1] ?? '');
			const name = heading.replace(/^\*\s*/, '');
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			const left = dropdown.match(LEFT)?.[1] ?? '';
			const right = dropdown.match(RIGHT)?.[1] ?? '';
			const outcome = clean(right).match(OUTCOME)?.[1]?.trim() ?? '';
			const exited = Boolean(outcome) || heading.startsWith('*');
			companies.push({
				name,
				category: [
					segment,
					tag(right.match(LOCATION)?.[1] ?? ''),
					outcome ? tag(outcome[0].toUpperCase() + outcome.slice(1)) : '',
					exited ? 'Exited' : ''
				]
					.filter((t, i, all) => t && all.indexOf(t) === i)
					.join(', '),
				url: unescape(left.match(LINK)?.[1] ?? '').trim() || `${BASE_URL}${path}`
			});
		}
	}

	if (companies.length === 0) {
		throw new Error('digitalis: no companies on the portfolio pages');
	}

	return companies;
}
