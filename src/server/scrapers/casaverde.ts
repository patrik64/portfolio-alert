import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://casaverdecapital.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress and elementor: a wall of logos, each linking the company's site on most,
// with a line of what it does, the only label the page gives, and "Exited" on the
// ones it is. the logo's alt text reads "Dutchie Logo" on some and is empty on the
// rest, so those are named from a list looked up once, keyed by the address, or by
// the logo's file on the two without one. one missing from it is named after its
// address until it is added.
const NAMES: Record<string, string> = {
	'acecann.com': 'AceCann',
	'cannalysis.com': 'Cannalysis',
	'cansativa.de': 'Cansativa',
	'eaze.com': 'Eaze',
	'getproper.com': 'Proper',
	'greenbits.com': 'Greenbits',
	'greentanktech.com': 'Greentank',
	'growlink.ag': 'Growlink',
	'kompliant.com': 'Kompliant',
	'leaflink.com': 'LeafLink',
	'mamedica.co.uk': 'Mamedica',
	'merryjane.com': 'Merry Jane',
	'missgrass.com': 'Miss Grass',
	'oxcantech.com': 'Oxford Cannabinoid Technologies',
	'prelude.pro': 'Prelude',
	'trellisgrows.com': 'Trellis',
	'vangst.com': 'Vangst',
	'BF_Logo_TwoTone-min': 'Bespoke Financial',
	Indose_Logo_small: 'Indose'
};

const TILE = /<a\b([^>]*\bclass="portfolio-item"[^>]*)>([\s\S]*?)<\/a>/g;
const SITE = /\bhref="(https?:\/\/[^"]+)"/;
const ALT = /\balt="([^"]*)"/;
const LOGO_FILE = /\bdata-src="[^"]*\/([^"/]+)\.\w+"/;
const LOGO_WORD = /\s+logo$/i;
const LINE = /class="excerpt small"[^>]*>([\s\S]*?)<\/div>/;
const EXITED = 'class="exited"';

const clean = (s: string) =>
	s
		.replace(/<[^>]*>/g, ' ')
		.replace(/&amp;|&#038;/g, '&')
		.replace(/&#0?39;|&#8217;|&rsquo;/g, "'")
		.replace(/\s+/g, ' ')
		.trim();

// "hello-bio.com" -> "Hello Bio"
const nameFrom = (host: string) =>
	host
		.split('.')[0]
		.split('-')
		.filter(Boolean)
		.map((word) => word[0].toUpperCase() + word.slice(1))
		.join(' ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, attributes, inner] of html.matchAll(TILE)) {
		const url = attributes.match(SITE)?.[1] ?? '';
		const host = url ? new URL(url).hostname.toLowerCase().replace(/^www\./, '') : '';
		const name =
			clean(inner.match(ALT)?.[1] ?? '').replace(LOGO_WORD, '') ||
			NAMES[host] ||
			NAMES[inner.match(LOGO_FILE)?.[1] ?? ''] ||
			(host ? nameFrom(host) : '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			category: [
				// the category is comma-joined, so a label holding a comma would read as two
				clean(inner.match(LINE)?.[1] ?? '').replace(/\s*,\s*/g, ' / '),
				inner.includes(EXITED) ? 'Exited' : ''
			]
				.filter(Boolean)
				.join(', '),
			url
		});
	}

	if (companies.length === 0) {
		throw new Error('casaverde: no companies on the portfolio page');
	}

	return companies;
}
