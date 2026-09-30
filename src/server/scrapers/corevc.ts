import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.corevc.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, laid out by hand: the portfolio is a wall of logos drawn as
// inline svg, with not a name anywhere in the markup. a tile carries a line
// about the company, on some a pill — "Unicorn", "Decacorn", "IPO",
// "Acquired", "Exited" — and, on most, a link to the company's site. so the
// names are kept here, keyed on the address a tile links: they are the
// names the fund gave each company on the portfolio page it kept before
// this one, which spelled them out, and for the companies added since, what
// their own sites call them. a company bought links, now and then, to its
// buyer, which is why Ribbon Health is found under h1.com. the tiles that
// link nowhere are old exits, and are keyed on the opening of their lines.
// an address not listed here still imports, named after itself the way the
// other domain-named scrapers do it, until it is added; a tile with neither
// a link nor a line known here has nothing to be named by and is left out.
const NAMES: Record<string, string> = {
	'abodemoney.com': 'Abode',
	'additionwealth.com': 'Addition',
	'alpacahealth.io': 'Alpaca Health',
	'arrived.com': 'Arrived',
	'asepha.ai': 'Asepha',
	'assuredallies.com': 'Assured Allies',
	'athenamoney.co': 'Athena',
	'atomic.financial': 'Atomic',
	'attainoutcomes.com': 'Attain',
	'authenticinsurance.com': 'Authentic',
	'autoblocks.ai': 'Autoblocks',
	'backpackpay.com': 'Backpack',
	'bestow.com': 'Bestow',
	'blueprintincome.com': 'Blueprint Income',
	'chalk.ai': 'Chalk',
	'columntax.com': 'Column Tax',
	'conduit.financial': 'Conduit',
	'coverhound.com': 'Coverhound',
	'finli.com': 'Finli',
	'forwardplatform.com': 'Forward',
	'freemodel.com': 'Freemodel',
	'fundera.com': 'Fundera',
	'get-carrot.com': 'Carrot',
	'getchapter.com': 'Chapter',
	'getpesto.com': 'Pesto',
	'groundswell.io': 'Groundswell',
	'h1.com': 'Ribbon Health',
	'healthsherpa.com': 'HealthSherpa',
	'hellobrigit.com': 'Brigit',
	'henrylabs.ai': 'Henry Labs',
	'jiko.com': 'Jiko',
	'keepfinancial.com': 'Keep',
	'kikoff.com': 'Kikoff',
	'lumanu.com': 'Lumanu',
	'mesh-platform.com': 'MESH',
	'miradortech.com': 'Mirador',
	'nerdwallet.com': 'NerdWallet',
	'neuronav.org': 'NeuroNav',
	'novacredit.com': 'Nova Credit',
	'noyo.com': 'Noyo',
	'onefinance.com': 'One Finance',
	'oportun.com': 'Oportun',
	'padsplit.com': 'PadSplit',
	'pandopooling.com': 'Pando',
	'pasito.ai': 'Pasito',
	'payjoy.com': 'PayJoy',
	'prismdata.com': 'Prism',
	'reelist.com': 'Reelist',
	'ripple.com': 'Ripple',
	'routive.ai': 'Routive',
	'runharbor.com': 'Harbor',
	'savvymoney.com': 'SavvyMoney',
	'saytechnologies.com': 'Say',
	'selfid.com': 'Self',
	'shop.mayvenn.com': 'Mayvenn',
	'spinwheel.io': 'Spinwheel',
	'transparency-analytics.com': 'Transparency Analytics',
	'unit21.ai': 'Unit21',
	'upwage.com': 'Upwage',
	'useplasma.ai': 'Plasma',
	'well.company': 'WELL',
	'withcherry.com': 'Cherry',
	'withflex.com': 'Flex',
	'withhugo.com': 'Hugo',
	'withsam.com': 'Sam',
	'xphealth.co': 'XP Health'
};

// the tiles that link nowhere, by how their lines begin
const LINES: Record<string, string> = {
	'benefits assistant': 'Trim',
	'cloud-based, multi-channel bill payments': 'Tio',
	'microsavings platform': 'Blast',
	'predictive credit models': 'L2C',
	'retirement plan management': 'Honest Dollar',
	'small-dollar loans that build savings': 'SeedFi',
	'software helping collections firms': 'Pairity'
};

const TILE = /(?=<(?:a|div)\b[^>]*\bclass="portfolio-logo_wrap\b)/;
const LINK = /\bhref="(https?:\/\/[^"]+)"/;
const LINE = /class="portfolio-desc\b[^"]*">([\s\S]*?)<\/div>/;
const PILL = /class="client-pill\b[^"]*">\s*<div>([\s\S]*?)<\/div>/;
// the pills that say the fund is out
const EXITS = /^(ipo|acquired|exited|merged)$/i;

const DECORATION = ['goto', 'get', 'try', 'use', 'join', 'with', 'go', 'my'];
const SUBDOMAIN = /^(www|en|de|fr|es|it|pt|nl|uk|us|app|shop)$/i;
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
		// a tile ends with its line; what follows the last of them is not its own
		const line = chunk.match(LINE);
		const tile = line ? chunk.slice(0, (line.index ?? 0) + line[0].length) : chunk.slice(0, chunk.indexOf('>') + 1);
		const site = unescape(tile.slice(0, tile.indexOf('>') + 1).match(LINK)?.[1] ?? '').trim();
		const host = hostOf(site);
		const told = clean(line?.[1] ?? '').toLowerCase();
		const name = host
			? (NAMES[host] ?? domainName(host))
			: (Object.entries(LINES).find(([opening]) => told.startsWith(opening))?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const pill = tag(tile.match(PILL)?.[1] ?? '');
		companies.push({
			name,
			category: [pill, EXITS.test(pill) ? 'Exited' : ''].filter((t, i, all) => t && all.indexOf(t) === i).join(', '),
			url: site || PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('corevc: no companies on the portfolio page');
	}

	return companies;
}
