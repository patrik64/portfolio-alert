import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.behindgeniusventures.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio page opens on a row of featured logos, each
// linking the company's site and naming it nowhere, and goes on to a list
// of the rest — the name, what the company does ("Applied AI", "Creator
// Tools") and, for most, a link to its site. a company sold says so in
// its name, "Ivee (acq. Hone Health)", which is taken off it. the featured
// companies are kept here by the addresses their logos link, as the logos
// read; an address not listed here still imports, named after itself the
// way the other domain-named scrapers do it, until it is added.
const NAMES: Record<string, string> = {
	'beacons.ai': 'Beacons',
	'creatium.com': 'Creatium',
	'getbiom.co': 'Biom',
	'intramotev.com': 'Intramotev',
	'joinstatus.com': 'Status',
	'maneva.ai': 'Maneva',
	'moldco.com': 'MoldCo',
	'noxmetals.co': 'Nox Metals',
	'textla.com': 'Textla',
	'trycoast.com': 'Coast'
};

const FEATURED = /<a\b[^>]*\bhref="([^"]*)"[^>]*\bclass="link-block-2 w-inline-block"/g;
const ROW =
	/<a\b[^>]*\bhref="([^"]*)"[^>]*\bclass="link-block-3 w-inline-block">\s*<div class="portfolio-item">\s*<div class="text-block-7">([\s\S]*?)<\/div>\s*<div class="text-block-8">([\s\S]*?)<\/div>/g;
const SOLD = /^(.*?)\s*\(\s*acq\.?\s+(?:by\s+)?([^)]*)\)\s*$/i;
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

const DECORATION = ['goto', 'get', 'try', 'use', 'join', 'with', 'go', 'my'];
const SUBDOMAIN = /^(www|en|de|fr|es|it|pt|nl|uk|us|app)$/i;
const SUFFIX = /^(co|com|or|ne|ac|go)$/i;
const MIN_BRAND = 3;

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
	const add = (company: ScrapedCompany) => {
		if (!company.name || STEALTH.test(company.name) || seen.has(company.name.toLowerCase())) return;
		seen.add(company.name.toLowerCase());
		companies.push(company);
	};

	for (const [, href, text, sector] of html.matchAll(ROW)) {
		const written = clean(text);
		const sold = written.match(SOLD);
		const site = unescape(href).trim();
		add({
			name: sold ? sold[1] : written,
			category: [tag(sector), sold ? `Acquired by ${tag(sold[2])}` : '', sold ? 'Exited' : ''].filter(Boolean).join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	for (const [, href] of html.matchAll(FEATURED)) {
		const site = unescape(href).trim();
		const host = /^https?:\/\//i.test(site) ? hostOf(site) : '';
		if (host) add({ name: NAMES[host] ?? domainName(host), category: '', url: site });
	}
	if (companies.length === 0) {
		throw new Error('behindgenius: no companies on the portfolio page');
	}

	return companies;
}
