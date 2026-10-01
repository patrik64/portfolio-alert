import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.atentocapital.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// framer: the portfolio page is two walls of logos, "Fund Investments",
// the venture funds the fund has backed, which are not companies and are
// not read, and "Company Investments", each logo linking the company's
// site and drawn once per screen size. none is named and the logos have
// no alt text, so the names are kept here, keyed on the address a logo
// links, as the logos read; an address not listed here still imports,
// named after itself the way the other domain-named scrapers do it, until
// it is added. a logo captioned with how the fund got out, "Exit to
// Walmart", keeps the caption as a tag.
const NAMES: Record<string, string> = {
	'19days.com': '19 Days',
	'accessoptics.com': 'Access Optics',
	'assemblyosm.com': 'Assembly OSM',
	'b2breviews.com': 'B2B Reviews',
	'benoble.io': 'Noble',
	'billionminds.com': 'BillionMinds',
	'bioeutectics.com': 'Bioeutectics',
	'boddlelearning.com': 'Boddle Learning',
	'briya.com': 'Briya',
	'buildwithin.com': 'BuildWithin',
	'bybug.io': 'ByBug',
	'candorhealth.com': 'Candor Health',
	'cariina.com': 'Cariina',
	'chownow.com': 'ChowNow',
	'cleancult.com': 'Cleancult',
	'compoundfoundry.com': 'Compound Foundry',
	'concertocare.com': 'ConcertoCare',
	'eddiihealth.com': 'eddii',
	'fabrichealth.com': 'Fabric',
	'getapril.com': 'April',
	'getarbit.com': 'Arbit',
	'getox.com': 'Ox',
	'goprelude.com': 'Prelude',
	'guardz.com': 'Guardz',
	'gumgum.com': 'GumGum',
	'halo-industries.com': 'Halo Industries',
	'hellobetween.com': 'Between',
	'hicapitalize.com': 'Capitalize',
	'inboxhealth.com': 'Inbox Health',
	'machinalabs.ai': 'Machina Labs',
	'medefy.com': 'Medefy',
	'onepay.com': 'OnePay',
	'optimize.health': 'Optimize Health',
	'otto.vet': 'Otto',
	'oysterhr.com': 'Oyster',
	'patchrx.io': 'PatchRx',
	'payfactory.io': 'Payfactory',
	'pearsuite.com': 'Pear Suite',
	'percepto.co': 'Percepto',
	'pushkinapp.com': 'PushKin',
	'remilk.com': 'Remilk',
	'seetree.ai': 'SeeTree',
	'sensi.ai': 'Sensi.AI',
	'simporter.com': 'Simporter',
	'sollishealth.com': 'Sollis Health',
	'sqream.com': 'SQream',
	'squadtrip.com': 'SquadTrip',
	'sunnyperiod.com': 'Sunny',
	'supervisas.com': 'Super Visas',
	'swaymedical.com': 'Sway Medical',
	'textvolt.com': 'Volt',
	'thistle.co': 'Thistle',
	'ursamajor.com': 'Ursa Major',
	'wereno.com': 'WeReno',
	'writesea.com': 'WriteSea'
};

const COMPANIES = />\s*Company Investments\s*</i;
// the wall ends where the footer's links to the site's own pages begin
const FOOTER = 'href="./"';
const LOGO = /<a\b[^>]*\bhref="(https?:\/\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
const OUTCOME = /\b(?:exit|exited|acquired|ipo|merged)\b/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

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
	const start = html.search(COMPANIES);
	if (start < 0) {
		throw new Error('atento: no "Company Investments" on the portfolio page');
	}
	const end = html.indexOf(FOOTER, start);
	const wall = html.slice(start, end < 0 ? undefined : end);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, href, body] of wall.matchAll(LOGO)) {
		const site = unescape(href).trim();
		const host = hostOf(site);
		const name = host ? (NAMES[host] ?? domainName(host)) : '';
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const caption = clean(body);
		const went = OUTCOME.test(caption) ? tag(caption) : '';
		companies.push({ name, category: [went, went ? 'Exited' : ''].filter(Boolean).join(', '), url: site });
	}
	if (companies.length === 0) {
		throw new Error('atento: no companies under "Company Investments"');
	}

	return companies;
}
