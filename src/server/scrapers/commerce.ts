import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://commerce.vc/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, a theme of its own: the portfolio is a grid of logos, each
// carrying the sectors its filters read ("Retail", "Payments", "Banking &
// Wealth", "Insurance", and "Featured", which is for show and dropped), a
// badge on the ones the fund is out of — "ACQ", "IPO" or plain "Exit" —
// and, on most, a link to the company's site. not a name is written: the
// logos have no alt text and their files are called anything ("06.png",
// "Screenshot-2025-12-13-at-2.55.38-PM.png"). so the names are kept here,
// keyed on the address a logo links, as the companies call themselves on
// their own sites and logos. the logos that link nowhere are old exits,
// and are keyed on their files; the fund's page linked them once, which is
// how they are known. an address not listed here still imports, named
// after itself the way the other domain-named scrapers do it, until it is
// added; a logo linking nowhere whose file is not listed has nothing to be
// named by and is left out.
const NAMES: Record<string, string> = {
	'astrada.co': 'Astrada',
	'authenticinsurance.com': 'Authentic',
	'autobooks.co': 'Autobooks',
	'batonsystems.com': 'Baton Systems',
	'bill.com': 'BILL',
	'billgo.com': 'BillGO',
	'bloomcred.it': 'Bloom Credit',
	'builder.io': 'Builder.io',
	'bureau.id': 'Bureau',
	'canarytechnologies.com': 'Canary Technologies',
	'candex.com': 'Candex',
	'canopyservicing.com': 'Canopy',
	'card91.io': 'Card91',
	'cardless.com': 'Cardless',
	'casaphq.com': 'Casap',
	'clara.com': 'Clara',
	'class8.com': 'Class8',
	'conduitpay.com': 'Conduit',
	'constrafor.com': 'Constrafor',
	'controlhub.com': 'ControlHub',
	'corp.narvar.com': 'Narvar',
	'covrtech.com': 'Covr',
	'crossmint.com': 'Crossmint',
	'enfi.ai': 'EnFi',
	'estimote.com': 'Estimote',
	'fi-navigator.com': 'FI Navigator',
	'finaloop.com': 'Finaloop',
	'flextract.com': 'Flextract',
	'flipsidecrypto.xyz': 'Flipside',
	'flueid.com': 'Flueid',
	'forter.com': 'Forter',
	'fountain.com': 'Fountain',
	'getcarefull.com': 'Carefull',
	'getfwd.com': 'Forward',
	'getmulberry.com': 'Mulberry',
	'getpesto.com': 'Pesto',
	'getpurpledot.com': 'Purple Dot',
	'greenboard.com': 'Greenboard',
	'gridspace.com': 'Gridspace',
	'hamsa.com': 'Hamsa',
	'inboxhealth.com': 'Inbox Health',
	'instock.com': 'Instock',
	'kasisto.com': 'Kasisto',
	'kevel.co': 'Kevel',
	'keychain.com': 'Keychain',
	'kin.us': 'Kin',
	'knightfintech.com': 'Knight Fintech',
	'ledgible.io': 'Ledgible',
	'liberateinc.com': 'Liberate',
	'linqia.com': 'Linqia',
	'lithic.com': 'Lithic',
	'lovelocal.in': 'LoveLocal',
	'm10.io': 'M10',
	'marketing.growcredit.com': 'Grow Credit',
	'marpipe.com': 'Marpipe',
	'marqeta.com': 'Marqeta',
	'meandu.com': 'me&u',
	'mishipay.com': 'Mishipay',
	'monark-markets.com': 'Monark',
	'moov.io': 'Moov',
	'mudflapinc.com': 'Mudflap',
	'mx.com': 'MX',
	'mycnote.com': 'CNote',
	'neuralpayments.com': 'Neural Payments',
	'ovationcxm.com': 'OvationCXM',
	'payamigo.com': 'PayAmigo',
	'paystand.com': 'Paystand',
	'paywithextend.com': 'Extend',
	'pensasystems.com': 'Pensa Systems',
	'portless.com': 'Portless',
	'precision-gx.com': 'PrecisionGX',
	'qualtik.com': 'Qualtik',
	'questanalytics.com': 'Quest Analytics',
	'rallyon.com': 'Rally',
	'resolvepay.com': 'Resolve',
	'retailnext.net': 'RetailNext',
	'simondata.com': 'Simon AI',
	'site.interchecks.com': 'Interchecks',
	'snapsheetclaims.com': 'Snapsheet',
	'socure.com': 'Socure',
	'steadyapp.com': 'SteadyIQ',
	'tabs.inc': 'Tabs',
	'treinta.co': 'Treinta',
	'trove.co': 'Trove',
	'trykarat.com': 'Karat',
	'tryduplo.com': 'Duplo',
	'tulip.com': 'Tulip',
	'unison.com': 'Unison',
	'updater.com': 'Updater',
	'vestwell.com': 'Vestwell',
	'vitablehealth.com': 'Vitable Health',
	'volitionbeauty.com': 'Volition Beauty',
	'weatherpromise.com': 'WeatherPromise',
	'zeal.com': 'Zeal',
	'zentist.io': 'Zentist'
};

// the logos that link nowhere, by their files
const LOGOS: Record<string, string> = {
	'03': 'Shoptalk',
	'06': 'InAuth',
	'amino-2': 'Amino',
	bloom: 'Blooom',
	bumped: 'Bumped',
	'CardNow-Logo-Horizontal-Web': 'CardNow',
	ClickSwitch: 'ClickSWITCH',
	cylindo: 'Cylindo',
	harvest: 'Harvest',
	'HMB_Logotype_2019_09_18-01-1-1': 'HMBradley',
	'inter-stellar': 'Interstellar',
	'Picture1-1': 'Bouncer',
	'Primary_logo___light_background-1': 'Cimulate',
	'Prime_Trust_Logo-1': 'Prime Trust',
	radius: 'Radius',
	'saving-star': 'SavingStar',
	session: 'SessionM',
	Theatro: 'Theatro'
};

const GRID = /<div\b[^>]*\bid="portfolio-grid"[\s\S]*?(?=<\/section>)/;
const TILE = /(?=<div\b[^>]*\bclass="portfolio"[\s>])/;
const SECTORS = /^<div\b[^>]*\bdata-industry="([^"]*)"/;
const BADGE = /class="portfolio-badge\b[^"]*"[^>]*>\s*<span>([\s\S]*?)<\/span>/;
const LINK = /<a\b[^>]*\bhref="([^"]*)"/;
const LOGO = /<img\b[^>]*\bsrc="([^"]*)"/;
// what a badge says about how the fund got out
const OUTCOMES: Record<string, string> = { acq: 'Acquired', ipo: 'IPO' };

const DECORATION = ['goto', 'get', 'try', 'use', 'join', 'with', 'go', 'my'];
const SUBDOMAIN = /^(www|en|de|fr|es|it|pt|nl|uk|us|app|corp|site|marketing)$/i;
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

const hostOf = (url: string) => {
	try {
		return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
	} catch {
		return '';
	}
};

// "…/uploads/2019/09/Prime_Trust_Logo-1-e1701208596519-300x54.jpg" ->
// "Prime_Trust_Logo-1": wordpress adds the size, and an edit's stamp
const fileOf = (src: string) =>
	decodeURIComponent(src.split(/[?#]/)[0].split('/').pop() ?? '')
		.replace(/\.\w+$/, '')
		.replace(/-\d+x\d+$/, '')
		.replace(/-e\d{10,}$/, '');

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
	const grid = (await resp.text()).match(GRID)?.[0] ?? '';

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const tile of grid.split(TILE).slice(1)) {
		const site = unescape(tile.match(LINK)?.[1] ?? '').trim();
		const host = /^https?:\/\//i.test(site) ? hostOf(site) : '';
		const name = host
			? (NAMES[host] ?? domainName(host))
			: (LOGOS[fileOf(unescape(tile.match(LOGO)?.[1] ?? ''))] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const badge = clean(tile.match(BADGE)?.[1] ?? '');
		const sectors = unescape(tile.match(SECTORS)?.[1] ?? '')
			.split(',')
			.map((s) => s.replace(/\s+/g, ' ').trim())
			.filter((s) => s && !/^featured$/i.test(s));
		companies.push({
			name,
			category: [...sectors, OUTCOMES[badge.toLowerCase()] ?? '', badge ? 'Exited' : '']
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: host ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('commerce: no companies on the portfolio page');
	}

	return companies;
}
