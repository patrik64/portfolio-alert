import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://8bitcapital.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress with wpbakery: the portfolio page is a grid of logos, most
// linking the company's site and none captioned or given alt text, so the
// names are kept here, keyed on the address a logo links, as the logos
// read; the logos that link nowhere, or only the fund's own page, are
// kept by their files. an address not listed here still imports, named
// after itself the way the other domain-named scrapers do it, until it is
// added; a file not listed is left out. nothing marks an exit.
const NAMES: Record<string, string> = {
	'1up.ai': '1up',
	'agree.com': 'Agree.com',
	'antfly.io': 'Antfly',
	'barndoor.ai': 'Barndoor AI',
	'bind.ai': 'Bind AI',
	'bookedworks.com': 'Booked',
	'bowtie.works': 'Bowtie',
	'cerbos.dev': 'Cerbos',
	'cloudfence.com': 'CloudFence',
	'codecomet.io': 'CodeComet',
	'daltonhq.ai': 'Dalton',
	'fluxpayroll.ai': 'Flux',
	'glue.ai': 'Glue',
	'idemeum.com': 'Idemeum',
	'impart.security': 'Impart Security',
	'instaswitch.co': 'InstaSwitch',
	'joinhoneyhealth.com': 'Honey Health',
	'pandium.com': 'Pandium',
	'propelauth.com': 'PropelAuth',
	'range.com': 'Range',
	'ratiotech.com': 'Ratio',
	'relmhq.com': 'Relm',
	'simplified.com': 'Simplified',
	'superpanel.io': 'Superpanel',
	'withlantern.com': 'Lantern',
	'workstation.ai': 'Workstation'
};

// the logos that link no site, by their files
const FILES: Record<string, string> = {
	'Augmend-Logo-and-Name1': 'Augmend',
	'gray-Jolt-66d85a5f446ef09dd917d1ba_jolt-horiz-for-dark-bg-2': 'Jolt AI',
	'gray-pipedream-1': 'Pipedream',
	'nira-svgviewer-output1': 'Nira'
};

const BLOCK = /(?=<div class="img-with-aniamtion-wrap)/;
const LINK = /<a\b[^>]*\bhref="([^"]*)"/;
const IMAGE = /<img\b[^>]*\bsrc="([^"]*)"/;
// matched against a link's whole host, as a bare "x.com" would catch netflix.com
const NOT_A_SITE = /(?:^|\.)(?:8bitcapital\.com|linkedin\.com|twitter\.com|x\.com)$/i;
const STEALTH = /^stealth\b/i;

// "…/uploads/2024/04/1up_ai_logo2.png?resize=…" -> "1up_ai_logo2"
const fileOf = (src: string) =>
	decodeURIComponent(src.replace(/&#0?38;|&amp;/g, '&').split(/[?#]/)[0].split('/').pop() ?? '').replace(/\.\w+$/, '');

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
		// a block ends at its image; the last runs on to the end of the page
		const block = chunk.slice(0, chunk.indexOf('/>', chunk.search(IMAGE)) + 2 || undefined);
		const link = (block.match(LINK)?.[1] ?? '').replace(/&amp;/g, '&').trim();
		const linked = /^https?:\/\//i.test(link) ? hostOf(link) : '';
		const host = linked && !NOT_A_SITE.test(linked) ? linked : '';
		const file = host ? '' : fileOf(block.match(IMAGE)?.[1] ?? '');
		const name = host ? (NAMES[host] ?? domainName(host)) : (FILES[file] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: '', url: host ? link : PAGE_URL });
	}
	if (companies.length === 0) {
		throw new Error('8bit: no companies on the portfolio page');
	}

	return companies;
}
