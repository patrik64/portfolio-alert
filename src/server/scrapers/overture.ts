import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.overture.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace, with the portfolio in a code block rather than a collection:
// the page's own json view comes back empty and the grid is built in the
// browser out of an array written into the page by hand. so the array is read
// out of the script.
//
// four of the entries are marked stealth. the fund holds their names in the
// array but prints Stealth in their place, so they are not names the fund
// publishes and they are left out.
//
// the entries carry the fund's three sectors as slugs, and the same script
// keeps the words it shows for them, so that table is read rather than the
// labels being written in here.
//
// the script also carries the order the fund ranks its companies in, under
// headings that are its own reading of how they are doing. none of that is
// printed on the page and none of it is a company's category, so only the
// acquired flag the page does print is taken from it.

const ARRAY = /\bOV\s*=\s*\[/;
// an entry: a name, and the sectors the fund files it under
const ENTRY = /\{\s*name:'((?:[^'\\]|\\.)*)'([^{}]*sectors:\[[^\]]*\][^{}]*)\}/g;
// the table the script keeps of what each slug is called on the page
const LABELS = /sectorLabel\s*=\s*\{([^}]*)\}/;
const PAIR = /(\w+)\s*:\s*'((?:[^'\\]|\\.)*)'/g;

const SECTORS = /sectors:\[([^\]]*)\]/;
const QUOTED = /'((?:[^'\\]|\\.)*)'/g;
const URL_ = /\burl\s*:\s*'((?:[^'\\]|\\.)*)'/;
// a company the fund names in the array but will not name on the page
const STEALTH = /\bstealth\s*:\s*(?:!0|true)\b/;
const ACQUIRED = /\bacquired\s*:\s*(?:!0|true)\b/;

const unescape = (s: string) => s.replace(/\\(.)/g, '$1');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a tag written with a comma in it would read
// as two rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const at = html.search(ARRAY);
	if (at === -1) {
		throw new Error('overture: the page no longer carries the portfolio array');
	}

	const named = new Map<string, string>();
	for (const [, slug, label] of (html.match(LABELS)?.[1] ?? '').matchAll(PAIR)) {
		named.set(slug, clean(label));
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, written, body] of html.slice(at).matchAll(ENTRY)) {
		if (STEALTH.test(body)) continue;

		const name = clean(written);
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const slugs = [...(body.match(SECTORS)?.[1] ?? '').matchAll(QUOTED)].map((m) => clean(m[1]));
		companies.push({
			name,
			category: [
				...slugs.map((slug) => tag(named.get(slug) ?? slug)),
				ACQUIRED.test(body) ? 'Acquired' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: clean(body.match(URL_)?.[1] ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('overture: no companies in the portfolio');
	}

	return companies;
}
