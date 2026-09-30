import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.earthandbeyond.ventures/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wix: the portfolio page is a wall of boxes that turn over on hover, a
// company a box — its logo linking its site, and a line about it behind.
// not a name is written, and the images' alt text is only their files'
// names ("Main Logo.png"), so the names are kept here, keyed on the
// address a logo links, as the logos read; two logos link nowhere and are
// kept by their images, and two boxes show a "Stealth Mode" card in place
// of a logo and are left out until the fund names them. an address not
// listed here still imports, named after itself the way the other
// domain-named scrapers do it, until it is added. nothing marks an exit.
const NAMES: Record<string, string> = {
	'coolvoc.com': 'CoolVOC',
	'elssway.com': 'Elssway',
	'ligenerate.com': 'LiGenerate',
	'mndl.bio': 'MNDL Bio',
	'noga-3d.com': 'Noga 3D',
	'pixel-sight.com': 'Pixel Sight',
	'quamcore.com': 'QuamCore',
	'skypearl.tech': 'SkyPearl',
	'spacetenna.io': 'SpaceTenna',
	'spiralphotonics.com': 'Spiral Photonics',
	'whilx.tech': 'Whilx'
};

// the logos that link nowhere, by their images
const IMAGES: Record<string, string> = {
	'd98bba_3199fa544cac4c02928bd963457ad816~mv2.png': 'Navona',
	'd98bba_bec6f40eedae49e0850ff8deb9efcd15~mv2.png': 'GreenLi'
};

const BOX = /(?=<div\b[^>]*\brole="region"[^>]*\baria-label="content changes on hover")/;
const LINK = /<a\b[^>]*\bhref="(https?:\/\/[^"]*)"/g;
const IMAGE = /<img\b[^>]*\bsrc="https:\/\/static\.wixstatic\.com\/media\/([^"/]+)\//;
const NOT_A_SITE = /wixstatic|wix\.com|earthandbeyond\.ventures|linkedin\.com|facebook\.com|jotform/i;
const STEALTH = /^stealth\b/i;

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
	for (const box of html.split(BOX).slice(1)) {
		const site = [...box.matchAll(LINK)].map(([, href]) => href.replace(/&amp;/g, '&').trim()).find((href) => !NOT_A_SITE.test(href)) ?? '';
		const host = site ? hostOf(site) : '';
		const image = host ? '' : (box.match(IMAGE)?.[1] ?? '');
		const name = host ? (NAMES[host] ?? domainName(host)) : (IMAGES[image] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: '', url: host ? site : PAGE_URL });
	}
	if (companies.length === 0) {
		throw new Error('earthandbeyond: no companies on the portfolio page');
	}

	return companies;
}
