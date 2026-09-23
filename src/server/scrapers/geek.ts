import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://geek.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, the whole collection on the one page: every company is an
// accordion whose logo, with no alt text, sits over a line about it, the year
// the fund came in ("Partnership: 2022") and, once opened, a link to its site
// written out; an "Exit" badge shows on the ones the fund is out of unless
// webflow's conditional visibility hides it. no name is written anywhere but
// in the logos, so a company is known by the address it links to, under the
// name it gives itself, looked up once; one missing from the list is named
// after its address until it is added. the cards' "Status" is webflow's own
// placeholder text and is not read.
const NAMES: Record<string, string> = {
	'arvist.ai': 'Arvist',
	'base.club': 'Base',
	'bowlton.com': 'Bowlton Kitchens',
	'caremaze.ai': 'Caremaze',
	'channel99.com': 'Channel99',
	'colors-ai.com': 'Colors AI',
	'competera.net': 'Competera',
	'cytronic.ai': 'Cytronic',
	'decilegroup.com': 'Decile Group',
	'filmustage.com': 'Filmustage',
	'foodready.ai': 'FoodReady',
	'getdynamiq.ai': 'Dynamiq',
	'getsensate.com': 'Sensate',
	'gocharlie.ai': 'Charlie',
	'gradual.com': 'Gradual',
	'grai.fm': 'Grai',
	'insense.pro': 'Insense',
	'joindebbie.com': 'Debbie',
	'joineve.ai': 'Eve',
	'joinskye.com': 'Skye',
	'jome.com': 'Jome',
	'lincode.ai': 'Lincode',
	'mademebuyit.io': 'Made Me Buy It',
	'mbue.ai': 'Mbue',
	'mdisrupt.com': 'MDisrupt',
	'mediary.tech': 'Mediary',
	'midfunnel.com': 'Midfunnel',
	'nomad-data.com': 'Nomad Data',
	'noty.ai': 'Noty.ai',
	'performica.com': 'Performica',
	'piramidal.ai': 'Piramidal',
	'poolday.ai': 'Poolday',
	'promptlayer.com': 'PromptLayer',
	'qibus.com': 'Qibus',
	'quintess.ai': 'Quintess',
	'salesform.com': 'Salesform',
	'scalestack.ai': 'Scalestack',
	'shapesxr.com': 'ShapesXR',
	'smartexpert.io': 'Smart Expert',
	'spice.xyz': 'Spice AI',
	'spikeapi.com': 'Spike API',
	'sportsvisio.com': 'SportsVisio',
	'subconscious.ai': 'Subconscious.ai',
	'tego.ai': 'Tego AI',
	'trl11.com': 'TRL11',
	'trutharrow.ai': 'TruthArrow',
	'tryclave.ai': 'Clave',
	'tryharmony.ai': 'Harmony AI',
	'v-art.digital': 'V-Art',
	'wokelo.ai': 'Wokelo',
	'yope.tv': 'Yope',
	'zencoder.ai': 'Zencoder',
	'zendata.dev': 'Zendata',
	'zentrades.pro': 'ZenTrades',
	'zerodrift.ai': 'ZeroDrift',
	'zscc.ai': 'Zettascale'
};

const ITEM = /(?=<div[^>]*role="listitem"[^>]*class="[^"]*\bportfolio-list_item\b)/;
const SITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*class="[^"]*\bportfolio_item-website\b/;
// shown unless webflow's conditional visibility hides it
const EXIT = /class="portfolio_is-exit(?: is-inner)?"/;
const YEAR = /Partnership:\s*<\/strong>\s*<\/div>\s*<div[^>]*>\s*(\d{4})\s*</;

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
		const year = item.match(YEAR)?.[1];
		companies.push({
			name,
			category: [year ? `Invested ${year}` : '', EXIT.test(item) ? 'Exited' : '']
				.filter(Boolean)
				.join(', '),
			url
		});
	}

	if (companies.length === 0) {
		throw new Error('geek: no companies on the portfolio page');
	}

	return companies;
}
