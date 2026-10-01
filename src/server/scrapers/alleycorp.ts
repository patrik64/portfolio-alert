import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://alleycorp.com/companies/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress with salient: the companies page is a grid of tiles, each
// naming the company, linking its site or, on a few, its page on the
// fund's site, and saying whether the fund built it or backed it,
// "Incubation" or "Investment", and how it got out, "Acquired" or a
// ticker ("NASDAQ: MDB"), kept as "IPO (NASDAQ: MDB)". "Incubation" is
// kept as a tag; "Investment", which nearly every tile says, is not.

const TILE = /(?=<div\b[^>]*\bclass="nectar-post-grid-item[ "])/;
const LINK = /<a\b[^>]*\bclass="nectar-post-grid-link"[^>]*\bhref="([^"]*)"/;
const NAME = /<h3\b[^>]*\bclass="post-heading"[^>]*>([\s\S]*?)<\/h3>/;
const META = /class="meta-excerpt"[^>]*>([\s\S]*?)<div class="comp-hov">/;
const LISTING = /^(nasdaq|nyse|lse|tsx|asx|hkex|euronext)\s*:\s*\$?\s*([\w.]+)$/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// "NASDAQ: MDB" -> "IPO (NASDAQ: MDB)", "Acquired" stays
function outcome(said: string): string {
	const listed = said.match(LISTING);
	if (listed) return `IPO (${listed[1].toUpperCase()}: ${listed[2].toUpperCase()})`;
	return said;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const tile of html.split(TILE).slice(1)) {
		const name = clean(tile.match(NAME)?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		// "Incubation | NASDAQ: MDB"
		const [kind = '', said = ''] = clean(tile.match(META)?.[1] ?? '').split(/\s*\|\s*/);
		const went = said ? outcome(tag(said)) : '';
		const site = unescape(tile.match(LINK)?.[1] ?? '').trim();
		companies.push({
			name,
			category: [/^incubation$/i.test(kind) ? 'Incubation' : '', went, went ? 'Exited' : '']
				.filter(Boolean)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('alleycorp: no companies on the companies page');
	}

	return companies;
}
