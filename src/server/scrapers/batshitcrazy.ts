import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.batshitcrazy.is/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace: the portfolio page is a grid of logo blocks, most linking
// the company's site and none captioned — the images' alt text is only
// their files' names ("Skull-Mountain-Logo-White.png" is liquid death's).
// so the names are kept here, keyed on the address a logo links, as the
// logos read; the three logos that link nowhere are kept by their files.
// an address not listed here still imports, named after itself the way
// the other domain-named scrapers do it, until it is added; an unlinked
// file not listed is left out. nothing marks an exit.
const NAMES: Record<string, string> = {
	'brandzooka.com': 'Brandzooka',
	'constellationlabs.io': 'Constellation',
	'dripdrone.com': 'Drip Drone',
	'getdor.com': 'Dor',
	'getsunday.com': 'Sunday',
	'gofire.co': 'Gofire',
	'influence.co': 'Influence.co',
	'kubos.com': 'Kubos',
	'liquiddeath.com': 'Liquid Death',
	'locomation.ai': 'Locomation',
	'opopop.com': 'Opopop',
	'polycade.com': 'Polycade',
	'radarrelay.com': 'Radar Relay',
	'ridecake.com': 'Cake',
	'riprow.com': 'RipRow',
	'shinesty.com': 'Shinesty',
	'sitter.app': 'Sitter',
	'sparkgrills.com': 'Spark Grills',
	'speqtral.space': 'SpeQtral',
	'tryfi.com': 'Fi',
	'xplore.com': 'Xplore'
};

// the logos that link nowhere, by their files
const IMAGES: Record<string, string> = {
	'61e6190f02234b4f046d2445_Large-White-Transparent-04 (1) (1)': 'Radian Aerospace',
	Aylologosquare: 'Aylo',
	'Outpost Design white': 'Outpost'
};

const BLOCK = /(?=<div class="sqs-block image-block sqs-block-image)/;
const LINK = /<a\b[^>]*\bclass="[^"]*\bsqs-block-image-link\b[^"]*"[^>]*\bhref="([^"]*)"|<a\b[^>]*\bhref="([^"]*)"[^>]*\bclass="[^"]*\bsqs-block-image-link\b/;
const IMAGE = /\bdata-src="([^"]*)"/;
const STEALTH = /^stealth\b/i;

// "…/Outpost+Design+white.png" -> "Outpost Design white"
const fileOf = (src: string) =>
	decodeURIComponent(src.split(/[?#]/)[0].split('/').pop() ?? '')
		.replace(/\+/g, ' ')
		.replace(/\.\w+$/, '');

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
	for (const chunk of html.split(BLOCK).slice(1)) {
		// a block ends at its figure; the last runs on to the end of the page
		const block = chunk.slice(0, chunk.indexOf('</figure>') + 1 || undefined);
		const linked = block.match(LINK);
		const site = (linked?.[1] ?? linked?.[2] ?? '').replace(/&amp;/g, '&').trim();
		const host = /^https?:\/\//i.test(site) ? hostOf(site) : '';
		const file = host ? '' : fileOf(block.match(IMAGE)?.[1] ?? '');
		const name = host ? (NAMES[host] ?? domainName(host)) : (IMAGES[file] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: '', url: host ? site : PAGE_URL });
	}
	if (companies.length === 0) {
		throw new Error('batshitcrazy: no companies on the portfolio page');
	}

	return companies;
}
