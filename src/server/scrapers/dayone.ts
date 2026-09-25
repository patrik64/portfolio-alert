import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.dayoneventures.com';
const PAGE_URL = `${BASE_URL}/#portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js over sanity, one page: the portfolio is a section of the home
// page, its data in the __NEXT_DATA__ script — a record per company with
// its domain, its founders, a line about it, the category the fund files
// it under ("climate & energy") and whether the fund is out. the records
// name no company, the page showing logos alone, so the names are kept here
// by domain — an exit's domain is at times the buyer's — and by the opening
// of the line for the few with no domain at all; a record not yet known is
// named off its domain.

const NEXT_DATA = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/;
const OUTCOME = /\b(acquired by [^.;,()]+|merged with [^.;,()]+|ipo)/i;
const STEALTH = /^stealth\b/i;

interface Record_ {
	domain?: string | null;
	mission?: string | null;
	category?: { title?: string } | null;
	exit?: boolean | null;
}

const NAMES: Record<string, string> = {
	'superhuman.com': 'Superhuman',
	'owner.com': 'Owner',
	'arcadia.com': 'Arcadia',
	'valaratomics.com': 'Valar Atomics',
	'posh.vip': 'Posh',
	'affiniti.finance': 'Affiniti',
	'aven.com': 'Aven',
	'getparker.com': 'Parker',
	'donotpay.com': 'DoNotPay',
	'truebill.com': 'Truebill',
	'world.org': 'World',
	'you.com': 'You.com',
	'symbolica.ai': 'Symbolica',
	'inv.tech': 'Invisible',
	'abelpolice.com': 'Abel',
	'regie.ai': 'Regie.ai',
	'artisan.co': 'Artisan',
	'moonhub.xyz': 'Moonhub',
	'orchidhealth.com': 'Orchid',
	'duckduckgo.com': 'DuckDuckGo',
	'remote.com': 'Remote',
	'arcusfi.com': 'Arcus',
	'alga.bio': 'Alga Biosciences',
	'anyroad.com': 'AnyRoad',
	'portal.atom.finance': 'Atom Finance',
	'ava.me': 'Ava',
	'livingcarbon.com': 'Living Carbon',
	'bluumbio.com': 'Bluum Bio',
	'wasted.earth': 'Wasted',
	'getcabal.com': 'Cabal',
	'withcompound.com': 'Compound',
	'two.inc': 'Two',
	'domuso.com': 'Domuso',
	'ellis.com': 'Ellis',
	'enso.org': 'Enso',
	'appewa.com': 'Ewa',
	'flow.club': 'Flow Club',
	'haystackteam.com': 'Haystack',
	'hofy.co': 'Hofy',
	'honehq.com': 'Hone',
	'knowherenews.com': 'Knowhere',
	'koop.xyz': 'Koop',
	'liven.love': 'Liven',
	'logseq.com': 'Logseq',
	'doordash.com': 'lvl5',
	'mainstreet.com': 'MainStreet',
	'makerain.com': 'Rainmaker',
	'martie.com': 'Martie',
	'mindstate.design': 'Mindstate Design Labs',
	'nebia.com': 'Nebia',
	'pathrise.com': 'Pathrise',
	'acorns.com': 'Pillar',
	'quera.com': 'QuEra',
	'reby.co': 'Reby',
	'askmodu.com': 'Modu',
	'sivo.com': 'Sivo',
	'joinskye.com': 'Skye',
	'snafurecords.com': 'Snafu Records',
	'twitter.com': 'Squad',
	'superrare.co': 'SuperRare',
	'superplastic.co': 'Superplastic',
	'reynko.com': 'ReynKo',
	'concert.bio': 'Concert Bio',
	'vibrantplanet.net': 'Vibrant Planet',
	'renewafi.com': 'Renewafi',
	'simulate.com': 'Simulate',
	'starpath.space': 'Starpath',
	'winnie.com': 'Winnie',
	'epochbiodesign.com': 'Epoch Biodesign',
	'fig.io': 'Fig',
	'calypsoai.com': 'CalypsoAI',
	'starlightcharging.com': 'Starlight',
	'astroforge.io': 'AstroForge',
	'cradle.xyz': 'Cradle',
	'n1.xyz': 'N1',
	'terranorbital.com': 'Terran Orbital',
	'espersatellites.co': 'Esper Satellites',
	'micro.so': 'Micro',
	'apxlending.com': 'APX Lending',
	'wordware.ai': 'Wordware',
	'filed.com': 'Filed',
	'puzzle.io': 'Puzzle',
	'durin.ai': 'Durin',
	'rmfg.com': 'RMFG',
	'superpower.com': 'Superpower',
	'netic.ai': 'Netic'
};
// the records with no domain, by the words their line opens with
const MISSIONS: Record<string, string> = {
	'connecting diners and chefs': 'Feastly'
};

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// a domain written plain ("you.com") or as an address, as a host and an
// address
function siteOf(domain: string): { host: string; url: string } {
	const trimmed = clean(domain);
	if (!trimmed) return { host: '', url: '' };
	try {
		const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
		return { host: url.hostname.toLowerCase().replace(/^www\./, ''), url: url.href };
	} catch {
		return { host: '', url: '' };
	}
}

// a name read off a host, for a record not yet known: "newco.com" is Newco
function domainName(host: string): string {
	const label = host.split('.')[0] ?? '';
	return label ? label[0].toUpperCase() + label.slice(1) : '';
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(`${BASE_URL}/`, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${BASE_URL}/: ${resp.status}`);
	}
	const json = (await resp.text()).match(NEXT_DATA)?.[1];
	if (!json) {
		throw new Error('dayone: the page carries no data');
	}
	const data = JSON.parse(json) as { props?: { pageProps?: { data?: { companies?: Record_[] } } } };
	const records = data.props?.pageProps?.data?.companies ?? [];

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const record of records) {
		const { host, url } = siteOf(record.domain ?? '');
		const mission = clean(record.mission ?? '');
		const name =
			NAMES[host] ??
			(host
				? domainName(host)
				: (Object.entries(MISSIONS).find(([opening]) => mission.toLowerCase().startsWith(opening))?.[1] ?? ''));
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		// the fund writes its categories small: "climate & energy", "ai"
		const label = tag(record.category?.title ?? '');
		const category = label.length <= 3 ? label.toUpperCase() : label;
		const outcome = mission.match(OUTCOME)?.[1] ?? '';
		const exited = Boolean(record.exit) || Boolean(outcome);
		companies.push({
			name,
			category: [
				category ? category[0].toUpperCase() + category.slice(1) : '',
				outcome ? tag(outcome[0].toUpperCase() + outcome.slice(1)) : '',
				exited ? 'Exited' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: url || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('dayone: no companies in the data the page carries');
	}

	return companies;
}
