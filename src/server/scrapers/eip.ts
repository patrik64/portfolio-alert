import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.energyimpactpartners.com/_portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, a theme of its own: the portfolio page is two grids of logos,
// headed "our portfolio" and "exits", each logo a tile that turns over into
// a paragraph about the company and a "Visit site" link. nothing names a
// company — the logo is a background image — so the names are kept here by
// the site's host (or, for a tile linking nowhere, the logo's file); a tile
// not yet known is named off its domain. the page files companies under
// nothing.

const SECTION = /(?=<h2 class="section-title">)/;
const HEADING = /^<h2 class="section-title">([\s\S]*?)<\/h2>/;
const ITEM = /(?=<div class="col-md-3 col-sm-4 portfolio-item-wrap")/;
const SITE = /class="portfolio-site-url"\s+href="([^"]*)"/;
const LOGO = /background-image:\s*url\(\s*['"]?([^'")]+)/;
const STEALTH = /^stealth\b/i;

// by the host of the site a tile links, without its "www."; the two linking
// news of the company rather than its site are keyed by the news site, the
// one linking nowhere by its logo's file
const NAMES: Record<string, string> = {
	'aeroseal.com': 'Aeroseal',
	'arcadiapower.com': 'Arcadia',
	'ayr.energy': 'Ayr Energy',
	'assetcool.com': 'AssetCool',
	'atmoszero.energy': 'AtmosZero',
	'atomic-canyon.com': 'Atomic Canyon',
	'atomicdata.com': 'Atomic Data',
	'audette.io': 'Audette',
	'basepowercompany.com': 'Base Power',
	'bedrockenergy.com': 'Bedrock Energy',
	'bostonmetal.com': 'Boston Metal',
	'carbonamerica.com': 'Carbon America',
	'ceibo.tech': 'Ceibo',
	'consultcelerity.com': 'Celerity',
	'chargerhelp.com': 'ChargerHelp!',
	'ciroos.ai': 'Ciroos',
	'civilgrid.com': 'CivilGrid',
	'communitytreeservice.net': 'Community Tree Service',
	'comnetcomm.com': 'ComNet Communications',
	'goconvey.com': 'Convey',
	'corelight.com': 'Corelight',
	'coro.net': 'Coro',
	'cyclicmaterials.earth': 'Cyclic Materials',
	'derivesystems.com': 'Derive',
	'dragonflyenergy.com': 'Dragonfly Energy',
	'eh2.com': 'Electric Hydrogen',
	'elementlpower.io': 'Elementl Power',
	'emeraldai.co': 'Emerald AI',
	'essolar.com': 'ES Solar',
	'esgbook.com': 'ESG Book',
	'esmartsystems.com': 'eSmart Systems',
	'ev.energy': 'ev.energy',
	'finitestate.io': 'Finite State',
	'addenergie.com': 'FLO',
	'formenergy.com': 'Form Energy',
	'fullcirclefiberpartners.com': 'Full Circle Fiber',
	'fyld.ai': 'FYLD',
	'greenly.earth': 'Greenly',
	'gridbeyond.com': 'GridBeyond',
	'gridx.com': 'GridX',
	'grover.com': 'Grover',
	'businesswire.com': 'Guardian Infrastructure Services',
	'guidearch.com': 'Guide Architecture',
	'heattransformers.com': 'HeatTransformers',
	'heronpower.com': 'Heron Power',
	'hinthome.com': 'Hint',
	'hippoharvest.com': 'Hippo Harvest',
	'hometree.co.uk': 'Hometree',
	'hopskipdrive.com': 'HopSkipDrive',
	'humblerobotics.ai': 'Humble',
	'ind-technology.com': 'IND Technology',
	'infravision.com.au': 'Infravision',
	'instagrid.co': 'instagrid',
	'ionsolar.com': 'ION Solar',
	'koloma.com': 'Koloma',
	'marketingevolution.com': 'Marketing Evolution',
	'measurabl.com': 'Measurabl',
	'metafuels.ch': 'Metafuels',
	'mill.com': 'Mill',
	'myenergi.com': 'myenergi',
	'nitricity.co': 'Nitricity',
	'outova.com': 'Outova',
	'overstory.com': 'Overstory',
	'oxford-flow.com': 'Oxford Flow',
	'palmetto.com': 'Palmetto',
	'particle.io': 'Particle',
	'powerfactors.com': 'Power Factors',
	'projectcanary.com': 'Project Canary',
	'quilt.com': 'Quilt',
	'rangeforce.com': 'RangeForce',
	'rapidsos.com': 'RapidSOS',
	'reframe.systems': 'Reframe Systems',
	'reverion.com': 'Reverion',
	'rheaply.com': 'Rheaply',
	'robust.ai': 'Robust.AI',
	'rockrabbit.ai': 'Rock Rabbit',
	'rondo.energy': 'Rondo Energy',
	'rspoles.com': 'RS Technologies',
	'scythe.io': 'SCYTHE',
	'sense.com': 'Sense',
	'sibros.com': 'Sibros',
	'singularity.energy': 'Singularity Energy',
	'site2020.com': 'Site 20/20',
	'sitetracker.com': 'Sitetracker',
	'smallhold.com': 'Smallhold',
	'anesicomfort.com': 'Stone Mountain Technologies',
	'sparkfund.co': 'Sparkfund',
	'stream.security': 'Stream Security',
	'sublime-systems.com': 'Sublime Systems',
	'concretefence.com': 'Superior Concrete Products',
	'swimlane.com': 'Swimlane',
	'techpropowergroup.com': 'TechPro',
	'terragiabiofuel.com': 'Terragia',
	'tescometering.com': 'TESCO',
	'thinklabs.ai': 'ThinkLabs AI',
	'trafficmobility.com': 'Traffic & Mobility Consultants',
	'transaera.com': 'Transaera',
	'vanishid.com': 'VanishID',
	'vietechnologies.com': 'VIE Technologies',
	'vistechmfg.com': 'VisTech Manufacturing Solutions',
	'voya.energy': 'Voya Energy',
	'wasabi.com': 'Wasabi Technologies',
	'xonasystems.com': 'XONA',
	'zapenergyinc.com': 'Zap Energy',
	'zolar.de': 'Zolar',
	'42crunch.com': '42Crunch',
	'6kinc.com': '6K',
	'blog.fluenceenergy.com': 'AMS',
	'aquamcorp.com': 'Aquam',
	'attivonetworks.com': 'Attivo Networks',
	'auto-grid.com': 'AutoGrid',
	'bhienergy.com': 'BHI Energy',
	'quantela.com': 'CIMCON Lighting',
	'clevest.com': 'Clevest',
	'constructionresourcesusa.com': 'Construction Resources',
	'dragos.com': 'Dragos',
	'ecobee.com': 'ecobee',
	'erock.com': 'ERock',
	'firstfuel.com': 'FirstFuel',
	'greenlots.com': 'Greenlots',
	'innowatts.com': 'Innowatts',
	'li-cycle.com': 'Li-Cycle',
	'manusbio.com': 'Manus Bio',
	'mimeo.com': 'Mimeo',
	'joinmosaic.com': 'Mosaic',
	'network-perception.com': 'Network Perception',
	'noeticcyber.com': 'Noetic',
	'ns1.com': 'NS1',
	'opusonesolutions.com': 'Opus One Solutions',
	'oort.io': 'Oort',
	'powerphase.com': 'Powerphase',
	'powin.com': 'Powin',
	'proterra.com': 'Proterra',
	'remix.com': 'Remix',
	'ring.com': 'Ring',
	'rubicon.com': 'Rubicon',
	'scytherobotics.com': 'Scythe Robotics',
	'smartrent.com': 'SmartRent',
	'spirepowersolutions.com': 'Spire Power Solutions',
	'tenere.com': 'Tenere',
	'greentechmedia.com': 'Tendril',
	'trccompanies.com': 'TRC',
	'trachteusa.com': 'Trachte',
	'trekkergroup.com': 'Trekker Group',
	'trifacta.com': 'Trifacta',
	'urbint.com': 'Urbint',
	'verinext.com': 'Verinext',
	'techcrunch.com': 'ViriCiti',
	'voltacharging.com': 'Volta',
	'williams-logo': 'Williams',
	'zitara.com': 'Zitara'
};

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the host of an address, without its "www.", or nothing for none
function hostOf(url: string): string {
	try {
		return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
	} catch {
		return '';
	}
}

// the stem of a logo's file, lowercased: "Williams-Logo.png" is williams-logo
const stemOf = (src: string) =>
	(unescape(src).split(/[?#]/)[0].split('/').pop() ?? '').replace(/\.[a-z0-9]+$/i, '').toLowerCase();

// a name read off a host, for a tile not yet known: "newco.com" is Newco
function domainName(host: string): string {
	const label = host.split('.')[0] ?? '';
	return label ? label[0].toUpperCase() + label.slice(1) : '';
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const section of html.split(SECTION).slice(1)) {
		const exited = /^exits$/i.test(clean(section.match(HEADING)?.[1] ?? ''));
		for (const item of section.split(ITEM).slice(1)) {
			const site = unescape(item.match(SITE)?.[1] ?? '').trim();
			const host = hostOf(site);
			const key = host || stemOf(item.match(LOGO)?.[1] ?? '');
			const name = NAMES[key] ?? (host ? domainName(host) : '');
			if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			companies.push({ name, category: exited ? 'Exited' : '', url: site || PAGE_URL });
		}
	}

	if (companies.length === 0) {
		throw new Error('eip: no companies on the portfolio page');
	}

	return companies;
}
