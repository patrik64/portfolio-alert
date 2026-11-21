import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.metaprop.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// vinext (next.js on vite), rebuilt on 2026-11-19: the portfolio page serves
// a dozen featured companies, and its "all" and "exits" tabs are drawn in the
// browser from a list baked into the page's portfolio script — a company each
// with its name, the industries the fund files it under ("Real estate /
// construction"), the stage it came in at, the year, where it is based, its
// site, and, for one the fund is out of, "exited" and how ("acquired by
// Nearmap, 2023"). the script is found through the page's entry module, whose
// file names carry a build hash, and the list is the one json document it
// parses. the founders' own investments (airbnb and the like) are a separate
// list in the same script and are not read.
//
// the industries, the stage, the year and the place are kept as tags, an exit
// with its buyer and the Exited tag. the old wall named no company at all, so
// its companies were stored under names read off their addresses
// ("Boweryvaluation", "Kel"); each is kept under that name, so it is not taken
// for a new company.
const STORED_AS: Record<string, string> = {
	'100': 'Get100',
	atc: 'Atcresearch',
	'acorn finance': 'Acornfinance',
	'at ease': 'Atease',
	billy: 'Billyforinsurance',
	bowery: 'Boweryvaluation',
	'branch technology': 'Branchtechnology',
	briq: 'Br',
	cofi: 'Cofilending',
	demex: 'Demexgroup',
	'estate intel': 'Estateintel',
	h2: 'H2corporation',
	'jubilee homes': 'Jubileehomes',
	kelvin: 'Kel',
	'kwant.ai': 'Kwant',
	'light rfp': 'Lightrfp',
	'pest share': 'Pestshare',
	'pinpoint analytics': 'Pinpointanalytics',
	renegade: 'Renegadeinsurance',
	showroom: 'Vestahome',
	'socialsign.in': 'Socialsignin',
	source: 'Tothesource',
	'split pay': 'Splitpay',
	'stay open': 'Stayopen',
	'switch automation': 'Switchautomation',
	'toggle holdings': 'Toggle',
	tracflo: 'Tracfloapp',
	trestle: 'Gotrestle',
	'uniti ai': 'Uniti'
};

const ENTRY = /<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]*\/index-[^"]*\.js)"/;
const DIRECTORY = /_next\/static\/chunks\/portfolio-directory-[\w-]+\.js/;
const LIST = 'JSON.parse(`[';
const EXITED = /^exited$/i;
// "acquired by Move, Inc. / Realtor.com, 2020" -> "Move / Realtor.com"
const BUYER = /^acquired by\s+(.+?)(?:,\s*(?:19|20)\d{2})?$/i;
const LEGAL = /,?\s+(?:inc|llc|ltd|corp)\.?(?=\s|,|$)/gi;
const STEALTH = /^stealth\b/i;

interface Company {
	name?: unknown;
	industries?: unknown;
	stage?: unknown;
	year?: unknown;
	hq?: unknown;
	status?: unknown;
	exit?: unknown;
	url?: unknown;
}

const text = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => s.replace(/\s*,\s*/g, ' / ');

// how the fund got out, as "Acquired by …"; "PointCentral, an Alarm.com company" keeps its first part
function exitOf(said: string): string {
	const buyer = said.match(BUYER)?.[1]?.replace(LEGAL, '').split(/,\s*/)[0].trim();
	return buyer ? `Acquired by ${buyer}` : '';
}

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await fetchText(PAGE_URL);
	const entry = html.match(ENTRY)?.[1];
	if (!entry) {
		throw new Error('metaprop: no entry module on the portfolio page');
	}
	const directory = (await fetchText(new URL(entry, BASE_URL).href)).match(DIRECTORY)?.[0];
	if (!directory) {
		throw new Error('metaprop: the entry module names no portfolio directory script');
	}
	const js = await fetchText(new URL(`/${directory}`, BASE_URL).href);
	const start = js.indexOf(LIST);
	const end = start < 0 ? -1 : js.indexOf('`)', start);
	if (end < 0) {
		throw new Error('metaprop: no company list in the portfolio directory script');
	}
	// the list sits in a template literal: its escapes are undone before parsing
	const list = JSON.parse(js.slice(start + LIST.length - 1, end).replace(/\\([\\`$])/g, '$1')) as Company[];

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const company of list) {
		const written = text(company.name);
		const name = STORED_AS[written.toLowerCase()] ?? written;
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const exited = EXITED.test(text(company.status));
		const industries = Array.isArray(company.industries) ? company.industries.map(text) : [];
		const year = String(company.year ?? '').match(/\b(?:19|20)\d{2}\b/)?.[0];
		const site = text(company.url);
		companies.push({
			name,
			category: [
				...industries.map(tag),
				tag(text(company.stage)),
				year ? `Invested ${year}` : '',
				tag(text(company.hq)),
				exited ? tag(exitOf(text(company.exit))) : '',
				exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('metaprop: no companies in the portfolio list');
	}

	return companies;
}
