import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.graphventures.com/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, the portfolio a collection on the home page: every company is a
// logo, with no alt text, linking its site, over a banner for one the fund is
// out of ("Acq. by Meta", "IPO"), and an asterisk on the partners' "personal
// investments". no name is written anywhere but in the logos, so a company is
// known by the address it links to, under the name it gives itself, looked up
// once; one missing from the list is named after its address until it is
// added. a few companies bought outright link to their buyer — spell to
// reddit, scan to snap, bizzy to sendgrid — and are listed under the buyer's
// address.
const NAMES: Record<string, string> = {
	'abhi.com.pk': 'Abhi',
	'aperturedata.io': 'ApertureData',
	'betterup.com': 'BetterUp',
	'bigboxvr.com': 'BigBox VR',
	'blueapron.com': 'Blue Apron',
	'circuitandchisel.com': 'Circuit & Chisel',
	'clearspace.today': 'ClearSpace',
	'climaterobotics.com': 'Applied Carbon',
	'cube.exchange': 'Cube Exchange',
	'cutanddry.com': 'Cut+Dry',
	'dapperlabs.com': 'Dapper Labs',
	'disclo.com': 'Disclo',
	'dubapp.com': 'Dub',
	'earnin.com': 'EarnIn',
	'enjoei.com.br': 'Enjoei',
	'envoy.com': 'Envoy',
	'extend.com': 'Extend',
	'fakespot.com': 'Fakespot',
	'fieldai.com': 'Field AI',
	'finesse.us': 'Finesse',
	'formally.com': 'Formally',
	'hang.xyz': 'Hang',
	'hashdex.com': 'Hashdex',
	'helpful.com': 'Helpful',
	'hinge.co': 'Hinge',
	'hoodline.com': 'Hoodline',
	'houseparty.com': 'Houseparty',
	'hydrahost.com': 'Hydra Host',
	'ipsy.com': 'Ipsy',
	'joinclubhouse.com': 'Clubhouse',
	'kelvin.ai': 'Kelvin',
	'kinara.ai': 'Kinara',
	'koltin.mx': 'Koltin',
	'lava.xyz': 'Lava',
	'lever.com': 'Lever',
	'lingokids.com': 'Lingokids',
	'loft.com.br': 'Loft',
	'matchday.com': 'Matchday',
	'meliuz.com.br': 'Méliuz',
	'metadata.io': 'Metadata',
	'mileiq.com': 'MileIQ',
	'nas.academy': 'Nas Academy',
	'nayapay.com': 'NayaPay',
	'neuroclues.com': 'NeuroClues',
	'niche.com': 'Niche',
	'opencare.com': 'Opencare',
	'papayapay.com': 'Papaya Payments',
	'particle.io': 'Particle',
	'picsart.com': 'Picsart',
	'pillarhq.com': 'Pillar',
	'pomelo.la': 'Pomelo',
	'porch.com': 'Porch',
	'quintoandar.com.br': 'QuintoAndar',
	'reddit.com': 'Spell',
	'regentcraft.com': 'REGENT',
	'returnly.com': 'Returnly',
	'rideos.ai': 'rideOS',
	'robinhood.com': 'Robinhood',
	'sage.care': 'Sage Care',
	'saildrone.com': 'Saildrone',
	'sailplan.com': 'SailPlan',
	'scenario.com': 'Scenario',
	'schoolai.com': 'SchoolAI',
	'sendgrid.com': 'Bizzy',
	'serverobotics.com': 'Serve Robotics',
	'shipsway.com': 'Sway',
	'skyroot.in': 'Skyroot Aerospace',
	'snap.com': 'Scan',
	'somosinternet.com': 'Somos Internet',
	'tavrn.ai': 'Tavrn',
	'truelayer.com': 'TrueLayer',
	'verygoodsecurity.com': 'Very Good Security',
	'vivareal.com.br': 'VivaReal',
	'wealthfront.com': 'Wealthfront',
	'whykeyway.com': 'Keyway',
	'wirestock.io': 'Wirestock',
	'xy.ai': 'XY.AI Labs',
	'yummysuperapp.com': 'Yummy',
	'zeplin.io': 'Zeplin',
	'ziina.com': 'Ziina'
};

const ITEM = /(?=<div[^>]*role="listitem"[^>]*class="[^"]*\bcollection-item\b)/;
const SITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*class="[^"]*\bportfolio---company\b/;
// shown unless webflow's conditional visibility hides it
const ASTERISK = /class="portfolio---company---asterick"/;
const CALLOUT = /class="company-callout-text"[^>]*>([\s\S]*?)<\/div>/;

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

// the category is comma-joined, so a note holding a comma would read as two
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
	for (const item of html.split(ITEM).slice(1)) {
		const url = unescape(item.match(SITE)?.[1] ?? '');
		const host = hostOf(url);
		if (!host) continue;
		const name = NAMES[host] ?? domainName(host);
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		// "Acq. by Meta" -> "Acquired by Meta"
		const outcome = tag(item.match(CALLOUT)?.[1] ?? '').replace(/^acq\.?\s+by\b/i, 'Acquired by');
		companies.push({
			name,
			category: [
				ASTERISK.test(item) ? 'Personal investment' : '',
				outcome,
				outcome ? 'Exited' : ''
			]
				.filter(Boolean)
				.join(', '),
			url
		});
	}

	if (companies.length === 0) {
		throw new Error('graph: no company logos on the home page');
	}

	return companies;
}
