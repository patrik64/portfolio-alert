import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.commonwealventures.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio is a grid of logos, each opening a panel with a
// line about the company, the year it was founded, its latest milestone,
// the verticals it is filed under and its site — everything but its name,
// which is only in the logo. so the names are kept here, keyed on the
// address a panel gives: they are what the companies call themselves on
// their own sites. an address not listed here still imports, named after
// itself the way the other domain-named scrapers do it, until it is added;
// a panel with no site has nothing to be named by and is left out.
//
// a milestone is mostly the latest round, which would be stale by the next
// one, so it is kept only where it says how the company left — "IPO",
// "Acquired" — and tags the company as exited. a tile flagged "GP" is, by
// the page's own footnote, an investment a general partner made outside
// the fund's funds; those are kept, and tagged. the filter runs in the
// browser, so the page holds every tile.
const NAMES: Record<string, string> = {
	'anadyr-horizon.com': 'Anadyr Horizon',
	'astranis.com': 'Astranis',
	'atomic-canyon.com': 'Atomic Canyon',
	'cleanchoiceenergy.com': 'CleanChoice Energy',
	'clipbook.io': 'Clipbook',
	'closure-intel.com': 'Closure Intelligence',
	'concoursetech.com': 'Concourse',
	'cruxclimate.com': 'Crux',
	'deckard.com': 'Deckard Technologies',
	'dutywise.com': 'Dutywise',
	'enertiv.com': 'Enertiv',
	'euclidpower.com': 'Euclid Power',
	'farther.com': 'Farther',
	'greatlyhealth.com': 'Greatly Health',
	'grid.aero': 'Grid Aero',
	'joinadvocate.com': 'Advocate',
	'joinatmos.com': 'Atmos Financial',
	'laneway.io': 'Laneway',
	'multitudeinsights.com': 'Multitude Insights',
	'palantir.com': 'Palantir',
	'pearledison.com': 'Pearl Edison',
	'propervoltage.com': 'Proper Voltage',
	'proximityhealth.com': 'Proximity Health',
	'robinhood.com': 'Robinhood',
	'roivant.com': 'Roivant',
	'sharpperformance.com': 'Sharp Performance',
	'starbridge.ai': 'Starbridge',
	'vico.io': 'VICO'
};

const TILE = /(?=<div\b[^>]*\bclass="portfolio_item[\s"])/;
const SITE = /<div class="text-size-small">\s*Website\s*<\/div>\s*<a\b[^>]*\bhref="([^"]*)"/i;
// a fact of the panel: its heading, and what it says
const FACT = /<div class="text-size-small">([^<]*)<\/div>\s*<div\b[^>]*>([^<]*)<\/div>/g;
const VERTICAL = /<div\b[^>]*\bclass="verticals-multi_text"[^>]*>([\s\S]*?)<\/div>/g;
const GP = /class="(gp-label[^"]*)"/;
// the milestones that say the fund is out
const EXITS = /^(ipo|acquired|merged|exited)\b/i;

const DECORATION = ['goto', 'get', 'try', 'use', 'join', 'with', 'go', 'my'];
const SUBDOMAIN = /^(www|en|de|fr|es|it|pt|nl|uk|us|app)$/i;
const SUFFIX = /^(co|com|or|ne|ac|go)$/i;
const MIN_BRAND = 3;

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

const hostOf = (url: string) => {
	try {
		return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
	} catch {
		return '';
	}
};

// "getfoo.com" -> "Foo", "ark-climate.de" -> "Ark Climate"
function domainName(host: string): string {
	const parts = host.split('.').filter((part) => !SUBDOMAIN.test(part));
	let label =
		parts.length >= 3 && SUFFIX.test(parts[parts.length - 2])
			? parts[parts.length - 3]
			: (parts[parts.length - 2] ?? parts[0] ?? '');
	const bare = DECORATION.find((d) => label.startsWith(d) && label.length - d.length >= MIN_BRAND);
	if (bare) label = label.slice(bare.length);
	return label
		.split('-')
		.filter(Boolean)
		.map((word) => word[0].toUpperCase() + word.slice(1))
		.join(' ');
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const chunk of html.split(TILE).slice(1)) {
		// a tile ends with its site; what follows the last of them is not its own
		const linked = chunk.match(SITE);
		if (!linked) continue;
		const tile = chunk.slice(0, (linked.index ?? 0) + linked[0].length);
		const site = unescape(linked[1]).trim();
		const host = hostOf(site);
		const name = host ? (NAMES[host] ?? domainName(host)) : '';
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const facts = new Map(
			[...tile.matchAll(FACT)].map(([, heading, value]) => [clean(heading).toLowerCase(), tag(value)])
		);
		const founded = facts.get('founded')?.match(/\b(?:18|19|20)\d{2}\b/)?.[0];
		const milestone = facts.get('milestone') ?? '';
		const out = EXITS.test(milestone);
		const label = tile.match(GP)?.[1] ?? '';
		companies.push({
			name,
			category: [
				...[...tile.matchAll(VERTICAL)].map(([, vertical]) => tag(vertical)),
				founded ? `Founded ${founded}` : '',
				label && !/\bw-condition-invisible\b/.test(label) ? 'GP investment' : '',
				out ? milestone : '',
				out ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: site
		});
	}
	if (companies.length === 0) {
		throw new Error('commonweal: no companies on the portfolio page');
	}

	return companies;
}
