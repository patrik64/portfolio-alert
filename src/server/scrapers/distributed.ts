import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.distributedvc.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
// the companies' pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: every company is a logo tile — its site behind it, a fund label
// ("Prior Investments" on the deals from before the fund), an "Acquired"
// badge left invisible on the rest, and a line about it — with a page of
// its own on the fund's site that holds only the categories it is filed
// under ("Wealth", "Insurance", "Health"), nested into the tile by the
// browser. those pages are fetched for the categories. nothing names a
// company, so the names are kept here by the site's host; a tile not yet
// known is named off its domain.

const ITEM = /(?=<div[^>]*class="portfolio-item extended w-dyn-item")/;
const PAGE = /<a\b[^>]*\bhref="(\/portfolio\/[^"#?]+)"/;
const SITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*class="port-link-over\b/;
const FUND = /fs-cmsfilter-field="fund"[^>]*>([^<]*)</;
const ACQUIRED = /class="acquired-div"[^>]*>[\s\S]*?<p[^>]*>([^<]*)</;
const CATEGORY = /class="category-div[^"]*"[^>]*>\s*<p[^>]*>([^<]+)</g;
const STEALTH = /^stealth\b/i;

const NAMES: Record<string, string> = {
	'401kplans.com': '401kplans.com',
	'armadillo.one': 'Armadillo',
	'useascend.com': 'Ascend',
	'covertree.com': 'CoverTree',
	'becvrd.com': 'CVRD',
	'cylinderhealth.com': 'Cylinder',
	'meetwithfocal.com': 'Focal',
	'honeycombinsurance.com': 'Honeycomb',
	'useindio.com': 'Indio',
	'kaihealth.ai': 'Kai Health',
	'marblepay.com': 'Marble',
	'origintherapy.com': 'Origin',
	'pillar.hr': 'Pillar',
	'planfees.com': 'PlanFees',
	'posterityhealth.com': 'Posterity Health',
	'letspresta.com': 'Presta',
	'rxsavecard.com': 'RxSaveCard',
	'hellosage.com': 'Sage',
	'trustlayer.io': 'TrustLayer',
	'tunedcare.com': 'Tuned',
	'wellthapp.com': 'Wellth',
	'wingspan.app': 'Wingspan'
};

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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// the host of an address, without its "www.", or nothing for none
function hostOf(url: string): string {
	try {
		return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
	} catch {
		return '';
	}
}

// a name read off a host, for a tile not yet known: "newco.com" is Newco
function domainName(host: string): string {
	const label = host.split('.')[0] ?? '';
	return label ? label[0].toUpperCase() + label.slice(1) : '';
}

// the categories a company's page files it under, or none when the page
// will not load
async function categoriesOf(page: string): Promise<string[]> {
	try {
		let resp = await fetch(page, { headers: { 'User-Agent': UA } });
		if (resp.status === 429) {
			await wait(20_000);
			resp = await fetch(page, { headers: { 'User-Agent': UA } });
		}
		if (!resp.ok) return [];
		return [...(await resp.text()).matchAll(CATEGORY)].map((m) => tag(m[1])).filter(Boolean);
	} catch {
		return [];
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const items = html.split(ITEM).slice(1);
	if (items.length === 0) {
		throw new Error('distributed: no companies on the portfolio page');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [i, item] of items.entries()) {
		const site = unescape(item.match(SITE)?.[1] ?? '').trim();
		const host = hostOf(site);
		const name = NAMES[host] ?? domainName(host);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const path = item.match(PAGE)?.[1];
		if (i > 0) await wait(PACE_MS);
		const categories = path ? await categoriesOf(`${BASE_URL}${unescape(path)}`) : [];
		const fund = tag(item.match(FUND)?.[1] ?? '');
		const outcome = tag(item.match(ACQUIRED)?.[1] ?? '');
		companies.push({
			name,
			category: [
				...categories,
				/^distributed ventures$/i.test(fund) ? '' : fund,
				outcome,
				outcome ? 'Exited' : ''
			]
				.filter((t, k, all) => t && all.indexOf(t) === k)
				.join(', '),
			url: site || (path ? `${BASE_URL}${unescape(path)}` : PAGE_URL)
		});
	}

	return companies;
}
