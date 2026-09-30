import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://ballisticventures.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress, a theme of its own: the portfolio page is two lists of
// cards, "Investments at Ballistic" and "Funded prior to Ballistic", the
// partners' before the fund, kept and tagged so. a card is a logo, an
// "OUTCOME" — "Private", "Acquired by Google", or a ticker ("NTSK") for a
// listing — a line about the company and a "Learn more" button linking
// its site, or for one sold the news of the sale. not a name is written:
// the logos' alt text is their files' names, "Mask group" for two of
// them, so the names are kept here by the logo's file, as the logos
// read, and the two that share a file by the address they link. a logo
// not listed here is named after the address it links, the way the other
// domain-named scrapers do it, until it is added.
const FILES: Record<string, string> = {
	'Above-black-logo': 'Above',
	'abnormal-logo': 'Abnormal Security',
	aembit: 'Aembit',
	Alethea: 'Alethea',
	'alien-vault-logo-1-2': 'AlienVault',
	'arc-sight': 'ArcSight',
	'arkose-labs-logo': 'Arkose Labs',
	'Armadin-1': 'Armadin',
	'ArmorCode-Logo-Standard-Dark': 'ArmorCode',
	AuthMind: 'AuthMind',
	'blend-logo': 'Blend',
	'bolt-logo': 'Bolt',
	BreachRx: 'BreachRx',
	'brex-logo': 'Brex',
	'cado-logo': 'Cado Security',
	'carta-logo': 'Carta',
	'Cato-1': 'Cato Networks',
	Codezero: 'Codezero',
	'cofense-logo': 'Cofense',
	'Concentric-AI': 'Concentric AI',
	'coro-logo': 'Coro',
	'cresta-logo': 'Cresta',
	'data-robot-logo': 'DataRobot',
	'dev-rev-logo': 'DevRev',
	'dexterity-ai-logo': 'Dexterity',
	'drata-logo': 'Drata',
	'fortify-logo-1-2': 'Fortify',
	GetReal: 'GetReal Security',
	'Gomboc-AI': 'Gomboc',
	'good-technologies-logo': 'Good Technology',
	'Hypernative-logo': 'Hypernative',
	'instana-logo': 'Instana',
	'intenet-security-sytems-logo': 'Internet Security Systems',
	'Interos-logo': 'Interos',
	'lucidum-logo': 'Lucidum',
	'Magnitude_logo-color_on_transparent-1': 'Magnitude',
	'mandiant-logo-1-2': 'Mandiant',
	mimic: 'Mimic',
	'native-logo-black@2x': 'Native',
	'netskope-logo': 'Netskope',
	noma: 'Noma Security',
	'nova-credit-logo': 'Nova Credit',
	nudge: 'Nudge Security',
	'offchain-logo': 'Offchain Labs',
	OverAI: 'OverAI',
	Pangea: 'Pangea',
	'people-ai-logo': 'People.ai',
	'phylum-logo': 'Phylum',
	'prodigy-logo': 'Prodigy',
	'qualia-logo': 'Qualia',
	'Reach-Logo-1': 'Reach Security',
	'Reveal-1': 'Reveal',
	'roofstock-logo': 'Roofstock',
	'Root-Evidence': 'Root Evidence',
	Semgrep: 'Semgrep',
	'SO-Logo_PurpleGreen': 'SpecterOps',
	'stackrox-logo': 'StackRox',
	'stairwell-logo': 'Stairwell',
	'stellar-cyber-logo': 'Stellar Cyber',
	Talon: 'Talon',
	'Talon-logo-1': 'Talon',
	'thoughtspot-logo': 'ThoughtSpot',
	Veza: 'Veza',
	WitnessAI: 'WitnessAI',
	'workos-logo': 'WorkOS',
	'Zip-Logomark-Orange-1': 'Zip Security',
	'zipline-logo': 'Zipline'
};

// the two logos whose file is only "Mask group", by the address they link
const HOSTS: Record<string, string> = {
	'oligo.security': 'Oligo Security',
	'uforce.com': 'UFORCE'
};

const PRIOR = /Funded prior to Ballistic/;
const CARD = /(?=<div class="future__item">)/;
const LOGO = /<img\b[^>]*\bsrc="([^"]*)"/;
const OUTCOME = /class="item-title"[^>]*>([\s\S]*?)<\/h6>/;
const LINK = /<a\b[^>]*\bclass="btn btn-text"[^>]*\bhref="([^"]*)"/;
const TICKER = /^[A-Z]{2,5}$/;
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

// "…/Above-black-logo-scaled.png" -> "Above-black-logo", sizes and all shed
const fileOf = (src: string) =>
	decodeURIComponent(src.split(/[?#]/)[0].split('/').pop() ?? '')
		.replace(/\.\w+$/, '')
		.replace(/-\d+x\d+$/, '')
		.replace(/-scaled$/, '');

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

// what an outcome says: nothing for "Private", the sale as written, a
// ticker as a listing
function exit(outcome: string): string {
	if (!outcome || /^private$/i.test(outcome)) return '';
	if (TICKER.test(outcome)) return `IPO (${outcome})`;
	return outcome.replace(/^acquired by\b/i, 'Acquired by');
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const priorAt = html.search(PRIOR);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let at = 0;
	for (const card of html.split(CARD).slice(1)) {
		at = html.indexOf(card, at);
		const prior = priorAt >= 0 && at > priorAt;
		const link = unescape(card.match(LINK)?.[1] ?? '').trim();
		const host = /^https?:\/\//i.test(link) ? hostOf(link) : '';
		const file = fileOf(unescape(card.match(LOGO)?.[1] ?? ''));
		const name = FILES[file] ?? HOSTS[host] ?? (host ? domainName(host) : '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const went = exit(tag(card.match(OUTCOME)?.[1] ?? ''));
		companies.push({
			name,
			category: [prior ? 'Prior Investment' : '', went, went ? 'Exited' : ''].filter(Boolean).join(', '),
			url: host ? link : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('ballistic: no companies on the portfolio page');
	}

	return companies;
}
