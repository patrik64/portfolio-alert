import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.companyventures.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio is a grid of tiles, each a logo, a line about the
// company, the industries it is filed under and a link to its site — and
// not a name anywhere in the markup, the logos carrying no alt text and
// half of their files named in gibberish. so the names are kept here, keyed
// on the address a tile links: they are what the companies call themselves
// on their own sites, and for a company whose site is gone or has passed
// into other hands (Common, Source3, Minim, ROI, Hoist), the name the fund
// gave it on the page it kept for each company before this site, or what
// its logo on this one reads. an address not listed here still imports,
// named after itself the way the other domain-named scrapers do it, until
// it is added; a tile linking nowhere has nothing to be named by and is
// left out. "load more" only unhides tiles the page already holds. an
// "Other" among the industries says nothing and is dropped. nothing marks
// an exit.
const NAMES: Record<string, string> = {
	'1fort.com': '1Fort',
	'airframe.ai': 'Airframe',
	'alternativepayments.io': 'Alternative Payments',
	'altoira.com': 'Alto IRA',
	'arrowhq.com': 'Arrow',
	'axlehealth.com': 'Axle Health',
	'basiccapital.com': 'Basic Capital',
	'beehiiv.com': 'beehiiv',
	'boomfantasy.com': 'Boom Sports',
	'boompay.app': 'Boom',
	'burnin.ai': 'Burnin',
	'carta.com': 'Carta',
	'centivo.com': 'Centivo',
	'chambercardio.com': 'Chamber Cardio',
	'charthop.com': 'ChartHop',
	'cliftonai.com': 'Clifton AI',
	'cohesive.ai': 'Cohesive AI',
	'common.com': 'Common',
	'didero.ai': 'Didero',
	'dieuxskin.com': 'Dieux',
	'elaborate.com': 'Elaborate',
	'elektrahealth.com': 'Elektra Health',
	'fig-1.co': 'Fig.1',
	'findoctave.com': 'Octave',
	'flora.ai': 'FLORA',
	'flychain.us': 'Flychain',
	'formulary.co': 'Formulary',
	'fruitful.com': 'Fruitful',
	'getprosper.ai': 'Prosper AI',
	'getroi.app': 'ROI',
	'glidepathai.com': 'Glidepath',
	'herohealth.com': 'Hero',
	'hilma.co': 'Hilma',
	'illumio.com': 'Illumio',
	'junipergenomics.com': 'Juniper Genomics',
	'kafene.com': 'Kafene',
	'kepler.ai': 'Kepler',
	'kraken.com': 'Kraken',
	'kuberahealth.com': 'Kubera Health',
	'lumesecurity.com': 'Lume Security',
	'mangodx.com': 'Mango',
	'markups.ai': 'Markups.ai',
	'mavenclinic.com': 'Maven Clinic',
	'meetresident.com': 'Resident',
	'minim.co': 'Minim',
	'mirado.ai': 'Mirado',
	'moodhealth.com': 'Mood Health',
	'moved.com': 'Moved',
	'nara.com': 'Nara Organics',
	'newtonx.com': 'NewtonX',
	'noetica.ai': 'Noetica',
	'nomadhealth.com': 'Nomad Health',
	'oova.life': 'Oova',
	'osohq.com': 'Oso',
	'particlehealth.com': 'Particle Health',
	'passthrough.com': 'Passthrough',
	'pinto.co': 'Pinto',
	'pinwheelapi.com': 'Pinwheel',
	'pixelworkforce.com': 'Pixel',
	'plaid.com': 'Plaid',
	'plural.sh': 'Plural',
	'republic.co': 'Republic',
	'robinhood.com': 'Robinhood',
	'rogo.ai': 'Rogo',
	'rotahealth.com': 'Rota Health',
	'seasonhealth.com': 'Season Health',
	'silvershield.ai': 'SilverShield',
	'source3.io': 'Source3',
	'stepful.com': 'Stepful',
	'tabs.com': 'Tabs',
	'tenlittle.com': 'Ten Little',
	'tigerdata.com': 'TigerData',
	'trestle.inc': 'Trestle',
	'tropicapp.io': 'Tropic',
	'unityai.co': 'UnityAI',
	'useretriever.com': 'Retriever',
	'viagogo.com': 'viagogo',
	'wingspan.app': 'Wingspan',
	'withhoist.com': 'Hoist',
	'zenlytic.com': 'Zenlytic',
	'zest.co': 'Zest'
};

const TILE = /(?=<div\b[^>]*\bclass="portfolio_companies_item\b)/;
const LINK = /<a\b[^>]*\bhref="([^"]*)"/;
const INDUSTRIES = /class="portfolio_companies_item_industries\b[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/;
const INDUSTRY = /<div\b[^>]*\brole="listitem"[^>]*>\s*<div\b[^>]*>([\s\S]*?)<\/div>/g;

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
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

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
	for (const chunk of html.split(TILE).slice(1)) {
		// a tile ends with its industries; what follows the last of them is not its own
		const filed = chunk.match(INDUSTRIES);
		const tile = filed ? chunk.slice(0, (filed.index ?? 0) + filed[0].length) : chunk;
		const site = unescape(tile.match(LINK)?.[1] ?? '').trim();
		const host = hostOf(site);
		const name = host ? (NAMES[host] ?? domainName(host)) : '';
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			category: [...(filed?.[0] ?? '').matchAll(INDUSTRY)]
				.map(([, industry]) => tag(industry))
				.filter((t, i, all) => t && !/^other$/i.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: site
		});
	}
	if (companies.length === 0) {
		throw new Error('companyventures: no companies on the portfolio page');
	}

	return companies;
}
