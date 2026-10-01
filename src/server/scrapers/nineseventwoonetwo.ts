import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.97212.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wix: the portfolio page is a column of strips, a company a strip — a
// picture, its logo, a line about it and a link to its site. not a name
// is written, and the logos' alt text is their files' names ("Group
// 498.png"), so the names are kept here, keyed on the address a strip
// links, as the logos read; an address not listed here still imports,
// named after itself the way the other domain-named scrapers do it,
// until it is added. nothing marks an exit.
const NAMES: Record<string, string> = {
	'aktivate.com': 'Aktivate',
	'bilton.tech': 'BiltOn',
	'causematch.com': 'CauseMatch',
	'celery.cc': 'Celery',
	'copilotkit.ai': 'CopilotKit',
	'cyngular.com': 'Cyngular',
	'dig.ai': 'Dig',
	'genrate.ai': 'Genrate',
	'heyritual.com': 'Ritual',
	'innerbalance.com': 'Inner Balance',
	'medida.ai': 'Medida',
	'novodia.co': 'NovoDia',
	'paraspot.ai': 'Paraspot',
	'permit.io': 'Permit.io',
	'remepy.com': 'Remepy',
	'rubato.life': 'Rubato',
	'symbolicmind.ai': 'Symbolic Mind',
	'trialkit.ai': 'TrialKit',
	'tymely.ai': 'Tymely',
	'xoltar.com': 'Xoltar'
};

// the portfolio lies between its heading and the contact section
const START = /WE DON[’']T JUST INVEST/;
const END = /info@97212\.vc/;
const LINK = /<a\b[^>]*\bhref="(https?:\/\/[^"]*)"/g;
// matched against a link's whole host, as a bare "x.com" would catch netflix.com
const NOT_A_SITE = /(?:^|\.)(?:wixstatic\.com|wix\.com|parastorage\.com|97212\.vc|medium\.com|linkedin\.com|twitter\.com|x\.com)$/i;
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
	const start = html.search(START);
	const end = html.search(END);
	const section = html.slice(start < 0 ? 0 : start, end < 0 ? undefined : end);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, href] of section.matchAll(LINK)) {
		const site = href.replace(/&amp;/g, '&').trim();
		const host = hostOf(site);
		if (NOT_A_SITE.test(host)) continue;
		const name = host ? (NAMES[host] ?? domainName(host)) : '';
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: '', url: site });
	}
	if (companies.length === 0) {
		throw new Error('97212: no companies on the portfolio page');
	}

	return companies;
}
