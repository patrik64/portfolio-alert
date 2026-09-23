import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.fusionfund.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace: three galleries of logos, with no headings between them, each
// logo linking the company's site, the image files named anything at all
// ("Untitled design (5).png", "2.png", "Logo Template (1).png") and no
// captions. no name is written anywhere but in the logos, so a company is
// known by the address it links to, under the name it gives itself, looked
// up once; one missing from the list is named after its address until it is
// added. a few link their buyer instead — lepton ai to nvidia, neuvector to
// suse, loop genomics to element biosciences, which the fund also holds — and
// the last is known by its image instead, as are the two logos linking
// nowhere. the companies the fund is out of have a ribbon drawn across the
// logo itself — "Exit", "Acquired", "IPO" or "Public" — so those are listed
// here too.
const NAMES: Record<string, string> = {
	'accern.com': 'Accern',
	'agilerl.com': 'AgileRL',
	'altislabs.com': 'Altis Labs',
	'atg.science': 'Autonomous Technologies Group',
	'birdie.ai': 'Birdie',
	'bluespace.ai': 'BlueSpace',
	'blumind.ai': 'Blumind',
	'bodo.ai': 'Bodo.ai',
	'brightsec.com': 'Bright Security',
	'capconnectplus.com': 'CapConnect+',
	'cellularintelligence.com': 'Cellular Intelligence',
	'codespark.com': 'codeSpark',
	'constructor.io': 'Constructor',
	'cosm.care': 'Cosm Medical',
	'cuseum.com': 'Cuseum',
	'direktiv.io': 'Direktiv',
	'dreamcraft.com': 'DreamCraft',
	'edgeq.io': 'EdgeQ',
	'elementbiosciences.com': 'Element Biosciences',
	'eridu.ai': 'Eridu',
	'grubmarket.com': 'GrubMarket',
	'iamrobotics.com': 'IAM Robotics',
	'inference.ai': 'Inference.ai',
	'koop.ai': 'Koop',
	'lightricks.com': 'Lightricks',
	'medra.ai': 'Medra',
	'memories.ai': 'Memories.ai',
	'meomind.com': 'Meomind',
	'missionbio.com': 'Mission Bio',
	'mojo.vision': 'Mojo Vision',
	'neuroharmonics.com': 'NeuroHarmonics',
	'nexa.ai': 'Nexa AI',
	'nexusflow.ai': 'Nexusflow',
	'nimblesci.com': 'Nimble Science',
	'niobium.co': 'Niobium',
	'nvidia.com': 'Lepton AI',
	'nviewmed.com': 'nView medical',
	'optimaldynamics.com': 'Optimal Dynamics',
	'orbifold.ai': 'Orbifold AI',
	'oto.ai': 'OTO',
	'otter.ai': 'Otter.ai',
	'overt.bio': 'OverT Bio',
	'palona.ai': 'Palona',
	'paperspace.com': 'Paperspace',
	'paradromics.com': 'Paradromics',
	'pheiron.com': 'Pheiron',
	'plexuss.com': 'Plexuss',
	'pointable.ai': 'Pointable',
	'popularpays.com': 'Popular Pays',
	'portal26.ai': 'Portal26',
	'proscia.com': 'Proscia',
	'realitydefender.com': 'Reality Defender',
	'rhinohealth.com': 'Rhino Federated Computing',
	'rubybio.com': 'Ruby Bio',
	'safehub.io': 'Safehub',
	'saifautonomy.ai': 'SAIF Autonomy',
	'sancho.com': 'Sancho',
	'scout.space': 'Scout Space',
	'sensenet.ai': 'SenseNet',
	'sonavex.com': 'Sonavex',
	'spacex.com': 'SpaceX',
	'starpath.space': 'Starpath',
	'subtlemedical.com': 'Subtle Medical',
	'suse.com': 'NeuVector',
	'talofagames.com': 'Talofa Games',
	'therna.ai': 'Therna',
	'theseus-txs.com': 'Theseus Therapies',
	'thisisl.com': 'This is L.',
	'threshold.network': 'NuCypher',
	'tvisioninsights.com': 'TVision',
	'vcluster.com': 'vCluster',
	'vectara.com': 'Vectara',
	'veridianhealth.com': 'Veridian',
	'volur.no': 'Völur',
	'voyageai.com': 'Voyage AI',
	'wand.ai': 'Wand AI',
	'with.so': 'With',
	'you.com': 'You.com',
	'zeroport.co': 'Zeroport'
};

// logos their link cannot name, by the image's id
const LOGOS: Record<string, string> = {
	'7c45d09d-f6d3-4cb2-8aed-0310294254fa': 'Loop Genomics',
	'66242cbd-9fd7-4a60-afdd-90aaf8b1b68c': 'Spinna',
	'4cd6cf06-de9c-49e1-b9dc-01da8110de7c': 'Looptify'
};

// the ribbon on each logo that has one
const RIBBONS: Record<string, string> = {
	Accern: 'Exit',
	codeSpark: 'Exit',
	Constructor: 'Exit',
	Cuseum: 'Exit',
	Direktiv: 'Exit',
	'IAM Robotics': 'Exit',
	'Lepton AI': 'Exit',
	'Loop Genomics': 'Exit',
	'Nexa AI': 'Exit',
	Nexusflow: 'Exit',
	NeuVector: 'Exit',
	NuCypher: 'Public',
	OTO: 'Exit',
	Paperspace: 'Exit',
	Pointable: 'Acquired',
	'Popular Pays': 'Exit',
	SpaceX: 'IPO',
	'This is L.': 'Exit',
	'Voyage AI': 'Exit',
	With: 'Exit'
};

const ITEM = /(?=<figure class="gallery-grid-item\b)/;
const LINK = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/;
const IMAGE = /data-src="[^"]*\/content\/v1\/[^/]+\/([0-9a-f-]{36})\/([^"?]+)/;
const STEALTH = /^stealth\b/i;

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

// "Spinna.png" -> "Spinna"; a file named for nothing in particular names no one
function fileName(file: string): string {
	const name = decodeURIComponent(file.replace(/\+/g, ' '))
		.replace(/\.\w+$/, '')
		.replace(/\b(logo|template|exit|acquired|untitled design|screenshot)\b.*$/i, '')
		.replace(/[-_]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	return /[a-z]{3}/i.test(name) ? name : '';
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const link = unescape(item.match(LINK)?.[1] ?? '');
		const host = hostOf(link);
		const [, id = '', file = ''] = item.match(IMAGE) ?? [];
		const name = LOGOS[id] ?? (host ? (NAMES[host] ?? domainName(host)) : fileName(file));
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const ribbon = RIBBONS[name] ?? '';
		companies.push({
			name,
			category: [/^exit$/i.test(ribbon) ? '' : ribbon, ribbon ? 'Exited' : ''].filter(Boolean).join(', '),
			url: link
		});
	}

	if (companies.length === 0) {
		throw new Error('fusionfund: no logos in the portfolio galleries');
	}

	return companies;
}
