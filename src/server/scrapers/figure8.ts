import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.figure8.vc/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, the portfolio a collection on the home page under "Our
// investments": every item is a logo with no alt text, linking the company's
// site, over a line about it, the rounds the fund took part in ("Seed A B")
// and an "acquired" badge that webflow hides on the companies still held. a
// second collection further down, under "Infinite impact", is the family
// office's grantees — nonprofits, not investments — and is left alone. no
// name is written anywhere but in the logos, so a company is known by the
// address it links to, under the name it gives itself, looked up once; one
// missing from the list is named after its address until it is added.
const NAMES: Record<string, string> = {
	'bettermynd.com': 'Bettermynd',
	'bitclass.live': 'BitClass',
	'brellium.com': 'Brellium',
	'carboninsurance.co': 'Oka',
	'cleanenergycu.org': 'Clean Energy Credit Union',
	'clevercarehealthplan.com': 'Clever Care',
	'learnfully.com': 'Learnfully',
	'mintago.com': 'Mintago',
	'mursion.com': 'Mursion',
	'osmosis.org': 'Osmosis',
	'pathful.com': 'Nepris (Pathful)',
	'prosapient.com': 'proSapient',
	'signalvine.com': 'Signal Vine',
	'sparkwise.co': 'Sparkwise',
	'valerahealth.com': 'Valera Health',
	'walapay.io': 'Walapay'
};

const HEADING = /<h[1-6][^>]*>\s*Our investments\s*<\/h[1-6]>/i;
const LIST = /<div[^>]*class="[^"]*\bw-dyn-list\b/;
const ITEM = /(?=<div[^>]*role="listitem")/;
const LINK = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
const ROUNDS = /class="b2-grid\b[^"]*"[^>]*>([\s\S]*?)<\/div>/;
// the badge shown, as against hidden by webflow's conditional visibility
const BADGE = /<div class="badge">\s*<div class="badge-text2">([\s\S]*?)<\/div>/;

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

// the category is comma-joined, so a note holding a comma would read as two
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

// "Seed A B" -> Seed, Series A, Series B; the page writes one in capitals
const rounds = (text: string) =>
	clean(text)
		.split(/\s+/)
		.filter(Boolean)
		.map((r) => (/^seed$/i.test(r) ? 'Seed' : /^[a-z]$/i.test(r) ? `Series ${r.toUpperCase()}` : tag(r)));

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	// the collection under the heading, up to the next one
	const from = html.search(HEADING);
	if (from < 0) {
		throw new Error('figure8: no "Our investments" heading on the home page — the layout moved');
	}
	const section = html.slice(from);
	const start = section.search(LIST);
	const list = start < 0 ? '' : section.slice(start).split(/<h[1-6][^>]*>/)[0];

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of list.split(ITEM).slice(1)) {
		const url = unescape(item.match(LINK)?.[1] ?? '');
		const host = hostOf(url);
		if (!host) continue;
		const name = NAMES[host] ?? domainName(host);
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const badge = tag(item.match(BADGE)?.[1] ?? '');
		const exited = /acquired|exit|ipo/i.test(badge);
		companies.push({
			name,
			category: [
				...rounds(item.match(ROUNDS)?.[1] ?? ''),
				badge ? badge[0].toUpperCase() + badge.slice(1) : '',
				exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url
		});
	}

	if (companies.length === 0) {
		throw new Error('figure8: no investments under the heading on the home page');
	}

	return companies;
}
