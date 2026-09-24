import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.foothill.ventures/portfolio';
const MAX_PAGES = 20;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, a hundred cards to a page behind webflow's own "next" link. a card
// is a logo, with no alt text, over the fund's labels for the company — a
// subsector or two and its broad areas ("Semiconductor", "Photonics", "Deep
// Tech") — and opens a popup linking the company's site. no name is written
// anywhere but in the logos, so a company is known by the address it links
// to, under the name it gives itself, looked up once; one missing from the
// list is named after its address until it is added. a card whose popup links
// nowhere is known by its logo's file instead.
const NAMES: Record<string, string> = {
	'4btechnologies.com': '4B Technologies',
	'abacuspower.com': 'Abacus Power',
	'aetherfuels.com': 'Aether Fuels',
	'aira-technology.com': 'Aira Technology',
	'airtap.ai': 'Airtap AI',
	'am-batteries.com': 'AM Batteries',
	'ambilightinc.com': 'Ambilight',
	'amperesand.io': 'Amperesand',
	'ampup.io': 'AmpUp',
	'anjet.com': 'Anjet',
	'anyware-robotics.com': 'Anyware Robotics',
	'ascendelements.com': 'Ascend Elements',
	'avivalinks.com': 'Aviva Links',
	'avotres.com': 'Avotres',
	'axbio.com': 'Axbio',
	'bioeclipse.com': 'BioEclipse',
	'bubble.io': 'Bubble',
	'capacity.com': 'Capacity',
	'carbon6robotics.com': 'Carbon6 Robotics',
	'celerosystems.com': 'Celero Systems',
	'certik.org': 'CertiK',
	'chempower-corp.com': 'ChEmpower',
	'codepoint.xyz': 'Codepoint',
	'consider.com': 'Consider',
	'coreshelltech.com': 'Coreshell',
	'corvic.ai': 'Corvic',
	'couragene.com': 'Couragene',
	'deephow.com': 'DeepHow',
	'deepscribe.ai': 'DeepScribe',
	'd-matrix.ai': 'd-Matrix',
	'doubleloop.app': 'Doubleloop',
	'enspectrahealth.com': 'Enspectra Health',
	'erisyon.com': 'Erisyon',
	'feonenergy.com': 'Feon Energy',
	'finwavesemi.com': 'Finwave Semiconductor',
	'firstshift.ai': 'Firstshift',
	'focusai.com': 'Focus AI',
	'foxrobotics.com': 'Fox Robotics',
	'goodcall.com': 'Goodcall',
	'gruenergylab.com': 'GRU Energy Lab',
	'hayden.ai': 'Hayden AI',
	'hologram.xyz': 'Hologram',
	'hypercare.com': 'HyperCare',
	'hyperlightcorp.com': 'HyperLight',
	'idox.ai': 'Idox',
	'irmedtech.com': 'IMTC',
	'inchfab.com': 'Inchfab',
	'shopinsync.com': 'Insync',
	'iop.systems': 'IOP Systems',
	'isonohealth.com': 'iSono Health',
	'jacobirobotics.com': 'Jacobi Robotics',
	'juicefs.com': 'JuiceFS',
	'getkerrigan.com': 'Kerrigan',
	'koidra.ai': 'Koidra',
	'laminarhealth.ai': 'Laminar Health',
	'lightxcelerate.com': 'LightXcelerate',
	'lucidean-inc.com': 'Lucidean',
	'lunewave.com': 'Lunewave',
	'memverge.com': 'MemVerge',
	'metabob.com': 'Metabob',
	'metalenz.com': 'Metalenz',
	'movinganalytics.com': 'Movn Health',
	'nectry.com': 'Nectry',
	'nervonik.com': 'Nervonik',
	'neuexcell.com': 'NeuExcell Therapeutics',
	'neumarker.ai': 'Neumarker',
	'neuralgalaxy.com': 'Neural Galaxy',
	'nexstrom.com': 'Nexstrom',
	'next-ion.energy': 'Next-ion',
	'nimbus.energy': 'Nimbus',
	'novolinc.com': 'NovoLINC',
	'omnidesigntech.com': 'Omni Design',
	'openprisetech.com': 'Openprise',
	'otter.ai': 'Otter.ai',
	'pareto.ai': 'Pareto',
	'patentpal.com': 'PatentPal',
	'persperiontech.com': 'Persperion',
	'proteowise.com': 'ProteoWise',
	'pseudolithic.com': 'PseudolithIC',
	'quintessent.com': 'Quintessent',
	'resiquant.ai': 'ResiQuant',
	'rosebud.ai': 'Rosebud',
	'ruli.ai': 'Ruli',
	'ryght.ai': 'Ryght',
	'safebutler.com': 'SafeButler',
	'snowdiamonds.com': 'Snow Diamonds',
	'sonothera.com': 'Sonothera',
	'south8technologies.com': 'South 8 Technologies',
	'statelybio.com': 'Stately Bio',
	'stellarcyber.ai': 'Stellar Cyber',
	'subconscious.dev': 'Subconscious',
	'subtlemedical.com': 'Subtle Medical',
	'supio.com': 'Supio',
	'synaptechealth.com': 'Synaptec Health',
	'synfini.com': 'Synfini',
	'tazi.ai': 'Tazi',
	'tessel.ai': 'Tessel',
	'tetramem.com': 'TetraMem',
	'theom.ai': 'Theom',
	'thruwave.com': 'ThruWave',
	'tigerlifescience.com': 'Tiger Life Science',
	'titanhaptics.com': 'Titan Haptics',
	'turing.ai': 'Turing AI',
	'unigridbattery.com': 'Unigrid',
	'visionular.com': 'Visionular',
	'waylens.com': 'Waylens',
	'saltalk.com': 'WeBox',
	'weride.ai': 'WeRide',
	'xmems.com': 'xMEMS',
	'zeto-inc.com': 'Zeto',
	'zsfab.com': 'ZSFab'
};

// the cards that link nowhere, by their logo's file
const BY_LOGO: Record<string, string> = {
	argospect: 'Argospect'
};

const CARD = /(?=<div[^>]*role="listitem"[^>]*class="[^"]*\bcollection-item\b)/;
const SITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*class="btn-partner-website/;
const LOGO = /<img\b[^>]*\bsrc="([^"]+)"[^>]*class="partner-logo"/;
const LABELS = /class="parter-detail-wrapper">([\s\S]*?)<\/a>/;
const LABEL = /<div\b[^>]*>([^<]+)<\/div>/g;
const NEXT = /href="(\?[a-z0-9_]+_page=\d+)"[^>]*class="[^"]*w-pagination-next/;

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
const tag = (s: string) => clean(s).replace(/\s*[,;]\s*/g, ' / ').replace(/\s*\/\s*$/, '');

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

// "…_Argospect.png" -> "argospect"
const logoKey = (src: string) =>
	decodeURIComponent(src.split('?')[0].split('/').pop() ?? '')
		.replace(/^([0-9a-f]{24}_)+/, '')
		.replace(/\.\w+$/, '')
		.toLowerCase();

export async function scrape(): Promise<ScrapedCompany[]> {
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();

	let url = PAGE_URL;
	for (let page = 0; page < MAX_PAGES && url; page++) {
		const resp = await fetch(url, { headers: { 'User-Agent': UA } });
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${url}: ${resp.status}`);
		}
		const html = await resp.text();

		for (const card of html.split(CARD).slice(1)) {
			const site = unescape(card.match(SITE)?.[1] ?? '');
			const host = hostOf(site);
			const key = logoKey(card.match(LOGO)?.[1] ?? '');
			const name = host ? (NAMES[host] ?? domainName(host)) : (BY_LOGO[key] ?? '');
			if (!name || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			const labels = [...(card.match(LABELS)?.[1] ?? '').matchAll(LABEL)].map((m) => tag(m[1]));
			companies.push({
				name,
				category: labels.filter((t, i, all) => t && all.indexOf(t) === i).join(', '),
				url: site
			});
		}

		const next = html.match(NEXT)?.[1];
		url = next ? `${PAGE_URL}${unescape(next)}` : '';
	}

	if (companies.length === 0) {
		throw new Error('foothill: no companies in the portfolio grid');
	}

	return companies;
}
