import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.decibel.vc/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: every company is a row that unfolds — a logo linking its site,
// with a line under it on one sold ("Acquired by Freshworks"), an
// overview, the sector the fund files it under ("Cybersecurity") and,
// unfolded, the founders, a status and the site again. nothing names a
// company in words, so the names are kept here by the site's host — one
// row, its company gone, links nowhere and is known by its overview — and a
// row not yet known is named off its domain.

const ROW = /(?=<div[^>]*class="company-list-acco-row w-dyn-item")/;
const SITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*class="company-logo-link\b/;
const TAGLINE = /class="company-logo-tagline"[^>]*>([^<]*)</;
const SECTOR = /fs-cmsfilter-field="sector"[^>]*>([^<]*)</;
const STATUS = /Status<\/div>\s*<p[^>]*>([^<]*)</;
const OVERVIEW = /class="company-small-txt">([\s\S]*?)<\/p>/;
const OUTCOME = /\b(a[cq]+uired\b[^<]*|exited\b[^<)]*|ipo\b[^<]*)/i;
const STEALTH = /^stealth\b/i;

const NAMES: Record<string, string> = {
	'abacus.ai': 'Abacus.AI',
	'akuity.io': 'Akuity',
	'answer.ai': 'Answer.AI',
	'aomni.com': 'Aomni',
	'bicycle.io': 'Bicycle',
	'blameless.com': 'Blameless',
	'botpress.com': 'Botpress',
	'brightwave.io': 'Brightwave',
	'censys.com': 'Censys',
	'credo.ai': 'Credo AI',
	'cube.dev': 'Cube',
	'dreadnode.io': 'Dreadnode',
	'dropzone.ai': 'Dropzone AI',
	'e2b.dev': 'E2B',
	'ent.ai': 'Ent',
	'fixify.com': 'Fixify',
	'knocknoc.io': 'Knocknoc',
	'magnify.io': 'Magnify',
	'mallory.ai': 'Mallory AI',
	'mantisbiotech.com': 'Mantis',
	'nebulock.io': 'Nebulock',
	'nira.com': 'Nira',
	'nocodb.com': 'NocoDB',
	'pachyderm.com': 'Pachyderm',
	'pangea.cloud': 'Pangea',
	'penpot.app': 'Penpot',
	'pixee.ai': 'Pixee',
	'platformatic.dev': 'Platformatic',
	'propelo.ai': 'Propelo',
	'prowler.com': 'Prowler',
	'pushsecurity.com': 'Push Security',
	'root.io': 'Root',
	'runzero.com': 'runZero',
	'scrunch.com': 'Scrunch',
	'specterops.io': 'SpecterOps',
	'spotnana.com': 'Spotnana',
	'strella.io': 'Strella',
	'sublime.security': 'Sublime Security',
	'unconv.ai': 'Unconventional AI',
	'userclouds.com': 'UserClouds',
	'veris.ai': 'Veris AI'
};
// the rows that link nowhere, by the words their overview opens with
const OVERVIEWS: Record<string, string> = {
	'security platform for linux': 'Cmd'
};

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;|​/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// the host of an address, without its "www.", or nothing for none
function hostOf(url: string): string {
	try {
		return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
	} catch {
		return '';
	}
}

// a name read off a host, for a row not yet known: "newco.com" is Newco
function domainName(host: string): string {
	const label = host.split('.')[0] ?? '';
	return label ? label[0].toUpperCase() + label.slice(1) : '';
}

// how a company went, as the row puts it, spelled and capitalised
function outcomeOf(...texts: string[]): string {
	for (const text of texts) {
		const found = clean(text).replace(/^\(|\)$/g, '').match(OUTCOME)?.[1];
		if (found) return (found[0].toUpperCase() + found.slice(1)).replace(/^Aquired/, 'Acquired').trim();
	}
	return '';
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const row of html.split(ROW).slice(1)) {
		const site = unescape(row.match(SITE)?.[1] ?? '').trim();
		const host = hostOf(site);
		const overview = clean(row.match(OVERVIEW)?.[1] ?? '').toLowerCase();
		const name =
			NAMES[host] ??
			(host ? domainName(host) : Object.entries(OVERVIEWS).find(([opening]) => overview.startsWith(opening))?.[1] ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const outcome = outcomeOf(row.match(TAGLINE)?.[1] ?? '', row.match(STATUS)?.[1] ?? '');
		companies.push({
			name,
			category: [tag(row.match(SECTOR)?.[1] ?? ''), outcome ? tag(outcome) : '', outcome ? 'Exited' : '']
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: site || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('decibel: no companies on the companies page');
	}

	return companies;
}
