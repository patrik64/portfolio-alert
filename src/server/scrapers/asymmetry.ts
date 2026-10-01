import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://asymmetry.vc/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress with elementor: the portfolio page is two grids of tiles,
// "Selected Seed Investments in AV Portfolio" and "... Prior to Founding
// of AV", the second kept as a tag. each tile is a picture linking the
// company's site, with the company's logo, a line about it and, for the
// ones the fund is out of, how it went ("Exited (Acquired By Oklo:
// Ticker "OKLO")") all drawn into the picture, and nothing of it in
// words. so the names are kept here, keyed on the address a tile links,
// as the logos read, and the exits beside them; an address not listed
// here still imports, named after itself the way the other domain-named
// scrapers do it, until it is added.
const NAMES: Record<string, string> = {
	'arraylabs.io': 'Array Labs',
	'atomicalchemy.us': 'Atomic Alchemy',
	'billiontoone.com': 'BillionToOne',
	'btq.com': 'BTQ',
	'chefrobotics.ai': 'Chef Robotics',
	'coreshell.com': 'Coreshell',
	'costplusdrugs.com': 'Cost Plus Drug Company',
	'cyberdontics.io': 'Cyberdontics',
	'cytoreason.com': 'CytoReason',
	'enlightra.com': 'Enlightra',
	'foresightmentalhealth.com': 'Foresight',
	'frontierbio.com': 'Frontier Bio',
	'genecis.co': 'Genecis',
	'h3x.tech': 'H3X',
	'heospace.com': 'HEO',
	'hypoint.com': 'HyPoint',
	'inpharmd.com': 'InpharmD',
	'junokids.com': 'Juno',
	'kernalbio.com': 'Kernal Bio',
	'mastreforest.com': 'Mast Reforestation',
	'newculture.com': 'New Culture',
	'orbitfab.com': 'Orbit Fab',
	'rejuvenationtech.com': 'Rejuvenation Technologies',
	'repeat.gg': 'Repeat.gg',
	'statiq.in': 'Statiq',
	'synovalife.com': 'Synova Life Sciences',
	'turionspace.com': 'Turion Space',
	'tybrhealth.com': 'TYBR Health',
	'viabot.com': 'Viabot'
};

// how the fund got out, as the tiles say it
const EXITS: Record<string, string> = {
	'atomicalchemy.us': 'Acquired by Oklo',
	'billiontoone.com': 'IPO (BLLN)',
	'btq.com': 'IPO (BTQ)',
	'repeat.gg': 'Acquired by Sony'
};

const HEADING = /<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/g;
const TILE = /\bclass="elementor-image-box-wrapper"[\s\S]*?<a\b[^>]*\bhref="([^"]*)"/g;
const PRIOR = /\bprior to\b/i;
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

	// "Selected Seed Investments Prior to Founding of AV" -> "Prior to Founding of AV"
	const priors = [...html.matchAll(HEADING)]
		.map((m) => ({ at: m.index ?? 0, text: clean(m[2]) }))
		.filter(({ text }) => /^selected\b/i.test(text));

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const tile of html.matchAll(TILE)) {
		const site = unescape(tile[1]).trim();
		const host = /^https?:\/\//i.test(site) ? hostOf(site) : '';
		const name = host ? (NAMES[host] ?? domainName(host)) : '';
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const heading = priors.filter(({ at }) => at < (tile.index ?? 0)).at(-1)?.text ?? '';
		const prior = PRIOR.test(heading) ? tag(heading.slice(heading.search(PRIOR))) : '';
		const went = EXITS[host] ?? '';
		companies.push({
			name,
			category: [prior && prior[0].toUpperCase() + prior.slice(1), went, went ? 'Exited' : '']
				.filter(Boolean)
				.join(', '),
			url: site
		});
	}
	if (companies.length === 0) {
		throw new Error('asymmetry: no tiles on the portfolio page');
	}

	return companies;
}
