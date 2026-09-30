import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://blank.com/#portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// framer: the portfolio is a section of the home page, a card a company —
// a logo linking the company's site, and on one card the word "EXITED".
// the page carries the wall five times, once a breakpoint. not a name is
// written, and all but two logos carry no alt text, so the names are kept
// here, keyed on the address a card links, as the logos read; an address
// not listed here still imports, named after itself the way the other
// domain-named scrapers do it, until it is added.
const NAMES: Record<string, string> = {
	'11th.com': '11th Estate',
	'agree.com': 'Agree.com',
	'atg.science': 'Autonomous Technologies Group',
	'atomicvaults.com': 'Atomic Vaults',
	'bynovella.com': 'Novella',
	'charter.space': 'Charter',
	'coris.ai': 'Coris',
	'eventualtreasury.com': 'Eventual',
	'fluxpayroll.ai': 'Flux',
	'getkoya.ai': 'Koya',
	'getmelrose.com': 'Melrose',
	'getstrada.com': 'Strada',
	'haloinvesting.com': 'Halo Investing',
	'importal.com': 'Importal',
	'joinblok.co': 'Blok',
	'joinrefine.io': 'Refine',
	'kanmon.com': 'Kanmon',
	'lithic.com': 'Lithic',
	'meetcaspian.com': 'Caspian',
	'meshpay.com': 'Mesh',
	'neofinancial.com': 'Neo Financial',
	'ontaurus.com': 'Taurus',
	'openledger.com': 'Open Ledger',
	'playbook.com': 'Playbook',
	'preczn.com': 'Preczn',
	'receivecorp.com': 'Receive',
	'reinforcelabs.ai': 'Reinforce Labs',
	'runloop.ai': 'Runloop',
	'scalepost.ai': 'ScalePost',
	'spotnana.com': 'Spotnana',
	'thenarrative.dev': 'Narrative',
	'uprise.us': 'Uprise',
	'useseeds.com': 'Seeds',
	'yournextstore.com': 'Your Next Store'
};

const CARD = /<a\b[^>]*\bname="CL-Portfolio"[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
const EXITED = />\s*EXITED\s*</;
const STEALTH = /^stealth\b/i;

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

	const companies = new Map<string, ScrapedCompany>();
	for (const [, href, body] of html.matchAll(CARD)) {
		const site = href.replace(/&amp;/g, '&').trim();
		const host = /^https?:\/\//i.test(site) ? hostOf(site) : '';
		const name = host ? (NAMES[host] ?? domainName(host)) : '';
		if (!name || STEALTH.test(name)) continue;
		const known = companies.get(name.toLowerCase());
		// the same card five times over: the mark on any copy counts
		if (known) {
			if (EXITED.test(body)) known.category = 'Exited';
			continue;
		}
		companies.set(name.toLowerCase(), { name, category: EXITED.test(body) ? 'Exited' : '', url: site });
	}
	if (companies.size === 0) {
		throw new Error('blank: no companies in the portfolio section');
	}

	return [...companies.values()];
}
