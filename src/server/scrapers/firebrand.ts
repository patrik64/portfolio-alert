import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.firebrandvc.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, the whole collection on the one page: every company is a logo,
// with no alt text, over a line about it and a "Visit Site" link; a badge
// appears on one the fund is out of ("Acquired"), and a card the fund has
// not announced yet says so instead of a logo and is left out. no name is
// written anywhere but in the logos, so a company is known by the address it
// links to, under the name it gives itself, looked up once; one sold and
// linking nowhere any more is keyed by its logo's file instead. a company
// missing from the list is named after its address until it is added.
const NAMES: Record<string, string> = {
	'assemble.fyi': 'Assemble',
	'automox.com': 'Automox',
	'choicedigital.com': 'Choice Digital',
	'craftydelivers.com': 'Crafty',
	'dropmobility.com': 'Drop Mobility',
	'dwolla.com': 'Dwolla',
	'ed.link': 'Edlink',
	'ephemeraltattoos.com': 'Ephemeral',
	'fitbark.com': 'FitBark',
	'fluent-forever.com': 'Fluent Forever',
	'handraise.com': 'Handraise',
	'hdata.us': 'HData',
	'judysecurity.ai': 'Judy Security',
	'localcrate.com': 'Local Crate',
	'lodasmarkets.com': 'LODAS Markets',
	'mermaidchart.com': 'Mermaid Chart',
	'nivati.com': 'Nivati',
	'notivize.com': 'Notivize',
	'omelas.io': 'Omelas',
	'pathspottech.com': 'PathSpot',
	'prefixinc.com': 'PreFix',
	'regiscompany.com': 'The Regis Company',
	'replicahq.com': 'Replica',
	'resurface.io': 'Resurface',
	'returnmates.com': 'Returnmates',
	'revopscoop.com': 'RevOps Co-op',
	'skiptown.io': 'Skiptown',
	'superdispatch.com': 'Super Dispatch',
	'tryvantagepoint.com': 'Vantage Point',
	'videate.io': 'Videate',
	'zohr.com': 'Zohr'
};

// the logos of the companies whose cards link nowhere, by file
const FILES: Record<string, string> = {
	'Headnote logo (7).png': 'Headnote',
	'TheMinte_Logo_Gold-1024x1024.png': 'The Minte',
	'6eafa3_d890250300604311a56f06f4095442df_mv2.png': 'Threatcare'
};

const ITEM = /(?=<div[^>]*role="listitem"[^>]*class="[^"]*\bportfolio-collection-item\b)/;
const LOGO = /<img\b[^>]*\bsrc="([^"]+)"[^>]*class="partner-logo"/;
const BADGE = /<div\b[^>]*class="([^"]*\bportfolio-badge\b[^"]*)"[^>]*>([\s\S]*?)<\/div>/;
const UNANNOUNCED = /<div class="([^"]*)">\s*Unannounced/;
const SITE = /<a\b[^>]*\bhref="([^"]*)"[^>]*class="text-link"/;

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

const titled = (s: string) =>
	s
		.split(/[\s_-]+/)
		.filter(Boolean)
		.map((word) => word[0].toUpperCase() + word.slice(1))
		.join(' ');

// "getfoo.com" -> "Foo", "ark-climate.de" -> "Ark Climate"
function domainName(host: string): string {
	const parts = host.split('.').filter((part) => !SUBDOMAIN.test(part));
	let label =
		parts.length >= 3 && SUFFIX.test(parts[parts.length - 2])
			? parts[parts.length - 3]
			: (parts[parts.length - 2] ?? parts[0] ?? '');
	const bare = DECORATION.find((d) => label.startsWith(d) && label.length - d.length >= MIN_BRAND);
	if (bare) label = label.slice(bare.length);
	return titled(label);
}

// "…/65ea7a02_Mermaid%20logo-full-pink%20(1).png" -> "Mermaid logo-full-pink (1).png"
const fileOf = (src: string) =>
	decodeURIComponent(src.split('?')[0].split('/').pop() ?? '').replace(/^[0-9a-f]{24}_/, '');

// a logo's file as a name, its "logo" and the like dropped: "Notivize Logo
// Yellow.png" -> "Notivize Yellow"; the least that can be said of a company
// whose card links nowhere and is not listed above
const fileName = (file: string) =>
	titled(
		file
			.replace(/\.\w+$/, '')
			.replace(/\b(logo|transparent|square|stacked|copy|low res|full|rgb|color|colour|removebg|preview|png|svg)\b/gi, ' ')
			.replace(/[()\d]+/g, ' ')
	);

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of html.split(ITEM).slice(1)) {
		const unannounced = item.match(UNANNOUNCED);
		if (unannounced && !/w-condition-invisible/.test(unannounced[1])) continue;
		const url = unescape(item.match(SITE)?.[1] ?? '').trim();
		const host = hostOf(url);
		const file = fileOf(item.match(LOGO)?.[1] ?? '');
		const name = host ? (NAMES[host] ?? domainName(host)) : (FILES[file] ?? fileName(file));
		if (!name || /^stealth\b/i.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const badge = item.match(BADGE);
		const outcome = badge && !/w-condition-invisible/.test(badge[1]) ? tag(badge[2]) : '';
		companies.push({
			name,
			category: outcome ? `${outcome}, Exited` : '',
			url: host ? url : ''
		});
	}

	if (companies.length === 0) {
		throw new Error('firebrand: no companies on the portfolio page');
	}

	return companies;
}
