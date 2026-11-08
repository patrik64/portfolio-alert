import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.goingvc.com/goingvc-partners';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: under "Our Investments" the portfolio is a wall of logos, each a
// link to the company's site, an exit marked by an "Exited" badge on the logo
// and kept with the Exited tag. the logos carry no names (every alt is
// empty), so a company is known by the address it links to, under the name
// it gives itself, looked up once; a sold company links its buyer's page for
// it, and two link their linkedin page, so those are known by the whole
// address. one missing from the list is named after its address, or after
// its linkedin handle, until it is added.
//
// below the wall sits an older copy of it split into sector tabs ("Health",
// "Power"), hidden and stale — every tab holds the same logos, and it says
// Ampere bought two companies where the wall says one — so only the wall is
// read.
const NAMES: Record<string, string> = {
	'withtwill.com': 'Twill',
	'beta.designpro.ai': 'DesignPro',
	'innovomarkets.com': 'Innovo',
	'theloops.io': 'TheLoops',
	'koda.health': 'Koda Health',
	'join-thebeans.io': 'The Beans',
	'actuate.ai': 'Actuate',
	'linkedin.com/company/athenacollects': 'Athena',
	'buildstock.com': 'Buildstock',
	'cased.com': 'Cased',
	'getcorrelated.com': 'Correlated',
	'dastgyr.com': 'Dastgyr',
	'endiatx.com': 'Endiatx',
	'microterra.com': 'MicroTerra',
	'linkedin.com/company/netspyglass': 'NetSpyGlass',
	'neurahealth.co': 'Neura Health',
	'theoasis.com': 'Oasis',
	'ouithepeople.com': 'OUI the People',
	// bought by Ampere, which links its own page for it
	'amperecomputing.com/solutions/ampere-ai': 'OnSpecta',
	'quantummetric.com': 'Quantum Metric',
	'shyftpower.com': 'Shyft Power',
	'tomi.digital': 'TOMi',
	// bought by 3D Systems, likewise
	'3dsystems.com/volumetric-biotechnologies': 'Volumetric',
	'wallaroo.ai': 'Wallaroo'
};

const HEADING = 'Our Investments';
// the hidden tabs, where the wall ends
const TABS = /<div\b[^>]*\bclass="[^"]*\bw-tabs\b/;
const LOGO = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
const EXITED = />\s*Exited\s*</i;
const LINKEDIN = /^linkedin\.com\/company\/([^/]+)/;

const DECORATION = ['goto', 'get', 'try', 'use', 'join', 'with', 'go', 'my'];
const SUBDOMAIN = /^(www|en|de|fr|es|it|pt|nl|uk|us|app|beta)$/i;
const SUFFIX = /^(co|com|or|ne|ac|go)$/i;
const MIN_BRAND = 3;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

// "https://www.foo.com/a/b/" -> "foo.com/a/b", and the host alone
function addressOf(url: string): { host: string; whole: string } {
	try {
		const { hostname, pathname } = new URL(url);
		const host = hostname.toLowerCase().replace(/^www\./, '');
		return { host, whole: `${host}${pathname.replace(/\/+$/, '').toLowerCase()}` };
	} catch {
		return { host: '', whole: '' };
	}
}

// "ark-climate" -> "Ark Climate"
const titled = (label: string) =>
	label
		.split('-')
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

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const start = html.indexOf(HEADING);
	const rest = start < 0 ? '' : html.slice(start);
	const end = rest.search(TABS);
	const wall = end < 0 ? rest : rest.slice(0, end);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, href, logo] of wall.matchAll(LOGO)) {
		const url = unescape(href).trim();
		const { host, whole } = addressOf(url);
		const handle = whole.match(LINKEDIN)?.[1];
		const name = NAMES[whole] ?? NAMES[host] ?? (handle ? titled(handle) : domainName(host));
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: EXITED.test(logo) ? 'Exited' : '', url });
	}

	if (companies.length === 0) {
		throw new Error('goingvc: no logos under "Our Investments" — the markup moved');
	}

	return companies;
}
