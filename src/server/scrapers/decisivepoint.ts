import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.decisivepoint.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: every company is a logo, a paragraph about it and a "Learn more"
// link to its site. nothing names a company, so the names are kept here by
// the site's host; a company not yet known is named off its domain. the
// page files companies under nothing and marks no exit.

const ITEM = /(?=<div[^>]*class="companies-item w-dyn-item")/;
const LINK = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*class="text-purple"/;
const STEALTH = /^stealth\b/i;

const NAMES: Record<string, string> = {
	'aloft.ai': 'Aloft',
	'asylonrobotics.com': 'Asylon',
	'aureliussystems.us': 'Aurelius Systems',
	'citra.space': 'Citra',
	'enhancedradar.com': 'Enhanced Radar',
	'episci.com': 'EpiSci',
	'firehawkaerospace.com': 'Firehawk Aerospace',
	'launchfirestorm.com': 'Firestorm',
	'flightwave.aero': 'Flightwave',
	'havocai.com': 'HavocAI',
	'intramotev.com': 'Intramotev',
	'liftaircraft.com': 'LIFT Aircraft',
	'luxaeterna.com': 'Lux Aeterna',
	'maybellquantum.com': 'Maybell Quantum',
	'macro-eyes.com': 'Pendulum Systems',
	'pisontechnology.com': 'Pison',
	'projectomega.com': 'Project Omega',
	'radiantnuclear.com': 'Radiant',
	'riserobotics.com': 'RISE Robotics',
	'scout.space': 'Scout Space',
	'scoutco.ai': 'Scout AI',
	'singularityus.com': 'Singularity',
	'standardnuclear.com': 'Standard Nuclear',
	'vatnsystems.com': 'Vatn Systems'
};

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

// the host of an address, without its "www.", or nothing for none
function hostOf(url: string): string {
	try {
		return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
	} catch {
		return '';
	}
}

// a name read off a host, for a company not yet known: "newco.com" is Newco
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
	for (const item of html.split(ITEM).slice(1)) {
		const site = unescape(item.match(LINK)?.[1] ?? '').trim();
		const host = hostOf(site);
		const name = NAMES[host] ?? domainName(host);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: '', url: site || PAGE_URL });
	}

	if (companies.length === 0) {
		throw new Error('decisivepoint: no companies on the portfolio page');
	}

	return companies;
}
