import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.borocapital.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wix: the portfolio page is a gallery of logos a fund, under headings
// naming each — "Fund II (fully invested)", "Fund I (fully invested)", and
// a Fund III with none to show yet — every logo linking the company's
// site. not a name is written and the images carry no alt text, so the
// names are kept here, keyed on the address a logo links, as the logos
// read; the one logo that links only the fund's own mailbox is kept by its
// image. an address not listed here still imports, named after itself the
// way the other domain-named scrapers do it, until it is added; an
// unlinked image not listed is left out. jump's logo says the fund is out
// of it ("Acquired by: Uber"), and nothing else on the page marks an exit.
const NAMES: Record<string, string> = {
	'conversifi.com': 'Conversifi',
	'dandelion.science': 'Dandelion Science',
	'detrapel.com': 'DetraPel',
	'drivehailify.com': 'Hailify',
	'earndlt.com': 'EarnDLT',
	'ettitude.com': 'Ettitude',
	'ezewholesale.com': 'Eze',
	'flexfinance.ai': 'Flex',
	'framepayments.com': 'Frame',
	'getrevi.com': 'Revi',
	'gradienthealth.io': 'Gradient Health',
	'imtc.com': 'IMTC',
	'intenseye.com': 'Intenseye',
	'jump.com': 'Jump',
	'lingrove.com': 'Lingrove',
	'michroma.co': 'Michroma',
	'noteworthy.ai': 'Noteworthy AI',
	'ocrolus.com': 'Ocrolus',
	'olimpwarehousing.com': 'OLIMP',
	'qortex.ai': 'Qortex',
	'qsm-diagnostics.com': 'QSM Diagnostics',
	'routier.io': 'Routier',
	'shamelesspets.com': 'Shameless Pets',
	'sportad.co': 'SportAD',
	'tassl.com': 'Tassl',
	'thrupore.com': 'ThruPore',
	'tireagent.com': 'Tire Agent',
	// trusty.care became circle in 2024, and the logo is circle's
	'trusty.care': 'Circle',
	'twosense.ai': 'Twosense',
	'upflex.com': 'Upflex',
	'xperiti.com': 'Xperiti'
};

// the logos that link no site, by their images
const IMAGES: Record<string, string> = {
	'689e83_fdb16ff777014fca91fb578ede4bf370~mv2.png': 'ThermoAura'
};

const EXITS: Record<string, string> = {
	'jump.com': 'Acquired by Uber'
};

// the fund headings and the gallery items, in the order the page has them;
// an item is a link, or a plain box when it links nowhere
const PART =
	/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>|<div\b[^>]*\bclass="[^"]*\bwixui-gallery__item\b[^"]*"[^>]*>\s*<(?:a|div)\b([^>]*)>([\s\S]*?)<\/gallery-image-sizer>/g;
const FUND = /^(Fund\s+(?:[IVX]+|\d+))\b/i;
const HREF = /\bhref="([^"]*)"/;
const IMAGE = /uri&quot;:&quot;([^&]*)&quot;/;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

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

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let fund = '';
	for (const [, heading, attributes, body] of html.matchAll(PART)) {
		if (heading !== undefined) {
			const named = clean(heading).match(FUND);
			if (named) fund = named[1].replace(/\s+/g, ' ');
			continue;
		}
		const site = unescape(attributes.match(HREF)?.[1] ?? '').trim();
		const host = /^https?:\/\//i.test(site) ? hostOf(site) : '';
		const image = host ? '' : (body.match(IMAGE)?.[1] ?? '');
		const name = host ? (NAMES[host] ?? domainName(host)) : (IMAGES[image] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const exit = EXITS[host];
		companies.push({
			name,
			category: [fund, exit, exit ? 'Exited' : ''].filter(Boolean).join(', '),
			url: host ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('boro: no companies in the portfolio galleries');
	}

	return companies;
}
