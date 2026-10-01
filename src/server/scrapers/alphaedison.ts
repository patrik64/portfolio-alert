import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.alphaedison.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace: the portfolio page is a grid of logos, each linking the
// company's site, with a caption that shows on hover and opens with the
// company's name in a sentence about it ("3DEO is a manufacturing
// company…"). a name in a sentence is no steady thing to read, and the
// logos have no alt text, so the names are kept here, keyed on the address
// a logo links, as the captions write them; an address not listed here
// still imports, named after itself the way the other domain-named
// scrapers do it, until it is added. one logo is drawn twice. nothing
// marks an exit.
const NAMES: Record<string, string> = {
	'3deo.co': '3DEO',
	'afero.io': 'Afero',
	'alloy.com': 'Alloy',
	'altoira.com': 'Alto IRA',
	'autoivf.com': 'AutoIVF',
	'avibra.com': 'Avibra',
	'bambee.com': 'Bambee',
	'buildops.com': 'BuildOps',
	'cabadesign.co': 'CABA Design',
	'comparably.com': 'Comparably',
	'coterieinsurance.com': 'Coterie Insurance',
	'digitaldiagnostics.com': 'Digital Diagnostics',
	'disqo.com': 'DISQO',
	'dolthub.com': 'DoltHub',
	'dressx.com': 'DressX',
	'earlydx.com': 'EarlyDiagnostics',
	'fanaply.com': 'Fanaply',
	'fletch.ai': 'Fletch',
	'frescocooks.com': 'Fresco',
	'gallant.com': 'Gallant',
	'gestalttech.com': 'Gestalt Tech',
	'getcarro.com': 'Carro',
	'getcoral.app': 'Coral',
	'goloti.com': 'Loti',
	'greenfly.com': 'Greenfly',
	'gtxn.co': 'GTXN',
	'honor.education': 'Honor Education',
	'housecanary.com': 'HouseCanary',
	'joinassembly.com': 'Assembly',
	'joon.io': 'JOON',
	'kin.com': 'Kin',
	'masonhub.co': 'MasonHub',
	'medal.tv': 'Medal',
	'mojo.sport': 'MOJO Sports',
	'ncx.com': 'NCX',
	'noveleffect.com': 'Novel Effect',
	'oliveandjune.com': 'Olive & June',
	'one.bio': 'One.Bio',
	'ownwell.com': 'Ownwell',
	'paradromics.com': 'Paradromics',
	'parsleyhealth.com': 'Parsley Health',
	'q-ctrl.com': 'Q-CTRL',
	'quoherent.com': 'Quoherent',
	'red6ar.com': 'Red6',
	'reframefinancial.com': 'Reframe Financial',
	'rizefs.com': 'Rize',
	'sidecarhealth.com': 'Sidecar Health',
	'standardmetrics.io': 'Standard Metrics',
	'supergut.com': 'Supergut',
	'syntiant.com': 'Syntiant',
	'trainwell.net': 'Trainwell',
	'transcrypts.com': 'TransCrypts',
	'turbine.co': 'Turbine',
	'upwards.com': 'Upwards',
	'ursamajor.com': 'Ursa Major'
};

const BLOCK = /(?=<div\b[^>]*\bclass="sqs-block image-block\b)/;
const LINK = /<a\b[^>]*\bhref="([^"]*)"/;
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
	for (const block of html.split(BLOCK).slice(1)) {
		const site = (block.match(LINK)?.[1] ?? '').replace(/&amp;/g, '&').trim();
		const host = /^https?:\/\//i.test(site) ? hostOf(site) : '';
		if (!host || host.endsWith('alphaedison.com')) continue;
		const name = NAMES[host] ?? domainName(host);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: '', url: site });
	}
	if (companies.length === 0) {
		throw new Error('alphaedison: no logos on the portfolio page');
	}

	return companies;
}
