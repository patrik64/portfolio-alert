import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.baruch.vc/portfolio/';
const FACET_URL = 'https://www.baruch.vc/wp-json/facetwp/v1/refresh';
const PACE_MS = 150;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress with facetwp: the portfolio page is a wall of logos, each
// linking the company's site and naming it nowhere, filtered by a radio
// of categories — "Renewable Electrons", "Circular Atoms" — that the page
// carries as data. the wall is asked for through the filter the way the
// page's script asks, once a category, and a company takes the category
// of each wall it is on. the names are kept here, keyed on the address a
// logo links, as the logos read; the one logo that links nowhere is kept
// by its file. an address not listed here still imports, named after
// itself the way the other domain-named scrapers do it, until it is
// added. nothing marks an exit.
const NAMES: Record<string, string> = {
	'aeroseal.com': 'Aeroseal',
	'altatech.io': 'Alta Resource Technologies',
	'applaudmedical.com': 'Avvio Medical',
	'astronetx.com': 'AstronetX',
	'biliqcolor.com': 'BiliQ',
	'biomx.com': 'BiomX',
	'biota.com': 'Biota',
	'caffree.com': 'Caffree',
	'calysta.com': 'Calysta',
	'carbonwave.com': 'Carbonwave',
	'checkerspot.com': 'Checkerspot',
	'codexis.com': 'Codexis',
	'corepowermagnetics.com': 'CorePower Magnetics',
	'coreshelltech.com': 'Coreshell',
	'electra.earth': 'Electra',
	'ellisdayskinscience.com': 'Ellis Day Skin Science',
	'evoloh.com': 'EVOLOH',
	'exelapharma.com': 'Exela Pharma Sciences',
	'ferveret.com': 'Ferveret',
	'fervoenergy.com': 'Fervo Energy',
	'foroenergy.com': 'Foro Energy',
	'geltor.com': 'Geltor',
	'giraffe-bio.com': 'Giraffe Bio',
	'growcentia.com': 'Growcentia',
	'hellowynd.com': 'Wynd',
	'hephaeet.com': 'Hephae',
	'hingebio.com': 'Hinge Bio',
	'inventwood.com': 'InventWood',
	'isolationbio.com': 'Isolation Bio',
	'khemiametals.com': 'Khemia Metals',
	'koboldmetals.com': 'KoBold Metals',
	'kwhanalytics.com': 'kWh Analytics',
	'luxwall.com': 'LuxWall',
	'menlosecurity.com': 'Menlo Security',
	'mosaicmaterials.com': 'Mosaic Materials',
	'nativemicrobials.com': 'Native Microbials',
	'noble.ai': 'NobleAI',
	'ohmium.com': 'Ohmium',
	'one.ai': 'Our Next Energy',
	'onekawater.com': 'Oneka Technologies',
	'photara.tech': 'Photara',
	'piqueaction.com': 'Pique Action',
	'plantpv.com': 'Plant PV',
	'polyspectra.com': 'polySpectra',
	'projectcanary.com': 'Project Canary',
	'prolific-machines.com': 'Prolific Machines',
	'relativityspace.com': 'Relativity Space',
	'rivahealth.com': 'Riva Health',
	'source.co': 'Source',
	'sparkthermionics.com': 'Spark Thermionics',
	'standardsoil.com': 'Standard Soil',
	'tachyus.com': 'Tachyus',
	'teselagen.com': 'TeselaGen',
	'thecommons.earth': 'Commons',
	'urbanelectricpower.com': 'Urban Electric Power',
	'veir.com': 'VEIR',
	'zignallabs.com': 'Zignal Labs'
};

// the logos that link nowhere, by their files
const FILES: Record<string, string> = {
	HelioTrope: 'Heliotrope'
};

const RESULT = /<div class="fwpl-result[^"]*">[\s\S]*?<a\b[^>]*\bhref="([^"]*)"[^>]*>\s*<img\b[^>]*\bsrc="([^"]*)"/g;
const SETTINGS = /window\.FWP_JSON\s*=\s*(\{[\s\S]*?\});\s*\n/;
const CHOICE = /data-value="([^"]+)"[^>]*>\s*<span class="facetwp-display-value">([\s\S]*?)<\/span>/g;
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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// "…/HelioTrope-300x177.jpeg" -> "HelioTrope"
const fileOf = (src: string) =>
	decodeURIComponent(src.split(/[?#]/)[0].split('/').pop() ?? '')
		.replace(/\.\w+$/, '')
		.replace(/-\d+x\d+$/, '');

// a linked logo's address, the "#new_tab" the theme appends taken off
const linkOf = (href: string) => unescape(href).replace(/#new_tab$/, '').trim();

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

interface Settings {
	preload_data?: { facets?: Record<string, string> };
}

// the wall through one category of the filter: the logos' links and files
async function filtered(slug: string): Promise<string[]> {
	const resp = await fetch(FACET_URL, {
		method: 'POST',
		headers: { 'User-Agent': UA, 'Content-Type': 'application/json' },
		body: JSON.stringify({
			action: 'facetwp_refresh',
			data: {
				facets: { portfolio_categories: [slug] },
				frozen_facets: {},
				http_params: { get: {}, uri: 'portfolio', url_vars: [] },
				template: 'portfolio_companies',
				extras: { counts: true },
				soft_refresh: 0,
				is_bfcache: 0,
				first_load: 0,
				paged: 1
			}
		})
	});
	if (!resp.ok) {
		throw new Error(`baruch: the filter would not answer for ${slug} (${resp.status})`);
	}
	const { template } = (await resp.json()) as { template?: string };
	return [...(template ?? '').matchAll(RESULT)].map(([, href, src]) => linkOf(href) + '|' + fileOf(src));
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const settings = JSON.parse(html.match(SETTINGS)?.[1] ?? '{}') as Settings;
	const choices = [...(settings.preload_data?.facets?.portfolio_categories ?? '').matchAll(CHOICE)].map(([, slug, label]) => ({
		slug,
		label: tag(label)
	}));

	type Listed = ScrapedCompany & { key: string; labels: string[] };
	const companies: Listed[] = [];
	const seen = new Set<string>();
	for (const [, href, src] of html.matchAll(RESULT)) {
		const link = linkOf(href);
		const host = /^https?:\/\//i.test(link) ? hostOf(link) : '';
		const file = fileOf(src);
		const name = host ? (NAMES[host] ?? domainName(host)) : (FILES[file] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: '', url: host ? link : PAGE_URL, key: link + '|' + file, labels: [] });
	}
	if (companies.length === 0) {
		throw new Error('baruch: no companies on the portfolio page');
	}

	for (const { slug, label } of choices) {
		await wait(PACE_MS);
		const keys = new Set(await filtered(slug));
		for (const company of companies) {
			if (keys.has(company.key) && !company.labels.includes(label)) company.labels.push(label);
		}
	}

	return companies.map(({ key: _key, labels, ...company }) => ({ ...company, category: labels.join(', ') }));
}
