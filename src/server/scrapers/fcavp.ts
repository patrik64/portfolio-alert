import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.fcavp.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio is a set of tabs — Active, then the sectors the fund
// files its companies under (Pharma, Providers, Payers, Innovative Care
// Delivery), then Exited — each a collection of logo cards, a company
// appearing on every tab it belongs to. a card links the company's site and
// says what it does, but names it nowhere: the logos carry no alt text. so a
// company is known by the address it links to, under the name it gives
// itself, looked up once; one missing from the list is named after its
// address until it is added. a card linking nowhere ("#") is known by its
// logo file instead. the sector tabs give the categories, the Exited tab the
// Exited tag.
const NAMES: Record<string, string> = {
	'1mp.com': 'One Mnet Health',
	'azra-ai.com': 'Azra AI',
	'branchlab.com': 'BranchLab',
	'carallel.com': 'Carallel',
	'casechek.com': 'Casechek',
	'chartwisemed.com': 'ChartWise',
	'clinicalink.com': 'Clinical Ink',
	'credohealth.com': 'Credo',
	'cylinderhealth.com': 'Cylinder Health',
	'diligentpharma.com': 'Diligent Pharma',
	'drughunter.com': 'Drug Hunter',
	'eblusolutions.com': 'eBlu Solutions',
	'enabledental.com': 'Enable Dental',
	'evolvedmd.com': 'evolvedMD',
	'feedtrail.com': 'Feedtrail',
	'gocheckkids.com': 'GoCheck Kids',
	'healthipass.com': 'Health iPASS',
	'home.payground.com': 'PayGround',
	'identalsoft.com': 'iDentalSoft',
	'ideonapi.com': 'Ideon',
	'ignitedata.com': 'IgniteData',
	'impiricus.com': 'Impiricus',
	'instockrx.com': 'InStockRx',
	'javararesearch.com': 'Javara',
	'joincoralcare.com': 'Coral Care',
	'kerafast.com': 'Kerafast',
	'kodehealth.com': 'KODE Health',
	'lumere.com': 'Lumere',
	'myaidin.com': 'Aidin',
	'nmible.com': 'nmible',
	'nvolve.com': 'Nvolve',
	'ohmd.com': 'OhMD',
	'patientpartner.com': 'PatientPartner',
	'peregrine-health.com': 'Peregrine Health',
	'posterityhealth.com': 'Posterity Health',
	'precision-gx.com': 'PrecisionGx',
	'providertrust.com': 'ProviderTrust',
	'remedly.com': 'Remedly',
	'revecore.com': 'Medical Reimbursements of America',
	'rubiconmd.com': 'RubiconMD',
	'saferidehealth.com': 'SafeRide Health',
	'shiftwizard.com': 'ShiftWizard',
	'sondermind.com': 'SonderMind',
	'spirashealth.com': 'Spiras Health',
	'thrivable.app': 'Thrivable',
	'vellum.health': 'Vellum Health',
	'virgosvs.com': 'Virgo',
	'watershedhealth.com': 'Watershed Health',
	'wellthapp.com': 'Wellth'
};

// the cards linking nowhere, by logo file
const UNLINKED: Record<string, string> = {
	'primum-white': 'Primum'
};

const TAB_LINK = /<a\b[^>]*\bdata-w-tab="([^"]*)"[^>]*class="[^"]*\bw-tab-link\b[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
const TAB_PANE = /<div\b[^>]*\bdata-w-tab="([^"]*)"[^>]*class="[^"]*\bw-tab-pane\b[^"]*"[^>]*>/g;
const ITEM = /(?=<div[^>]*role="listitem"[^>]*class="[^"]*\bportfolio13_item\b)/;
const LINK = /<a\b[^>]*\bhref="([^"]*)"[^>]*class="[^"]*\bportfolio13_item-link\b/;
const LOGO = /<img\b[^>]*\bsrc="([^"]+)"/;
const ACTIVE = /^active$/i;
const EXITED = /^exit/i;

const DECORATION = ['goto', 'get', 'try', 'use', 'join', 'with', 'go', 'my'];
const SUBDOMAIN = /^(www|en|de|fr|es|it|pt|nl|uk|us|app|home)$/i;
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

// "6903…_Primum-White.avif" -> "primum-white"
const fileKey = (src: string) =>
	decodeURIComponent(src.split('?')[0].split('/').pop() ?? '')
		.replace(/\.\w+$/, '')
		.replace(/^[0-9a-f]{24}_/, '')
		.toLowerCase();

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	// each tab's label, and the stretch of the page its pane covers
	const labels = new Map([...html.matchAll(TAB_LINK)].map(([, key, label]) => [key, tag(label)]));
	const panes = [...html.matchAll(TAB_PANE)].map((m) => ({ key: m[1], at: m.index ?? 0 }));
	if (panes.length === 0) {
		throw new Error('fcavp: the portfolio page has no tabs — the layout moved');
	}

	const companies = new Map<string, ScrapedCompany & { sectors: string[]; exited: boolean }>();
	panes.forEach((pane, i) => {
		const label = labels.get(pane.key) ?? pane.key;
		const stretch = html.slice(pane.at, panes[i + 1]?.at ?? html.length);
		for (const item of stretch.split(ITEM).slice(1)) {
			const url = unescape(item.match(LINK)?.[1] ?? '');
			const host = hostOf(url);
			const file = fileKey(item.match(LOGO)?.[1] ?? '');
			const name = host ? (NAMES[host] ?? domainName(host)) : (UNLINKED[file] ?? titled(file));
			if (!name) continue;
			const key = name.toLowerCase();
			const known = companies.get(key) ?? {
				name,
				category: '',
				url: host ? url : '',
				sectors: [],
				exited: false
			};
			if (EXITED.test(label)) known.exited = true;
			else if (!ACTIVE.test(label) && !known.sectors.includes(label)) known.sectors.push(label);
			companies.set(key, known);
		}
	});

	if (companies.size === 0) {
		throw new Error('fcavp: no companies on the portfolio page');
	}

	return [...companies.values()].map(({ sectors, exited, ...company }) => ({
		...company,
		category: [...sectors, exited ? 'Exited' : ''].filter(Boolean).join(', ')
	}));
}
