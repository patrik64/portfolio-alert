import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.babel.ventures/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wix: the portfolio page is a long scroll of pictures, a company a
// picture and a logo and a line about it, the logo linking the company's
// site for the companies the fund holds; further down, under "✅REALIZED",
// come the ones it has sold, and under "👻GAME OVER" the ones that folded,
// neither linked. not a name is written and the images' alt text is only
// their files' names, so the names are kept here, keyed on the address a
// logo links, as the logos read, and the unlinked logos — and one linked
// to another company's site by mistake — by their images. an address not
// listed here still imports, named after itself the way the other
// domain-named scrapers do it, until it is added; an image not listed is
// left out. a company under either later heading is one the fund is out
// of, and carries the heading as its mark.
const NAMES: Record<string, string> = {
	'blueland.com': 'Blueland',
	'cove.co': 'Cove',
	'crossingminds.com': 'Crossing Minds',
	'dirtylabs.com': 'Dirty Labs',
	'finlessfoods.com': 'Finless Foods',
	'foreverlabs.com': 'Forever Labs',
	'galy.co': 'Galy',
	'getmademan.com': 'MadeMan',
	'getmellows.com': 'Mellows',
	'goodfor.co.nz': 'GoodFor',
	'itsquim.com': 'Quim',
	'missionbarns.com': 'Mission Barns',
	'nabis.com': 'Nabis',
	'occamzrazor.com': 'OccamzRazor',
	'onmogul.com': 'Mogul',
	'snacktbh.com': 'tbh',
	'tryquinn.com': 'Quinn',
	'vitagene.com': 'Vitagene',
	'wildearth.com': 'Wild Earth',
	'zbiotics.com': 'ZBiotics'
};

// the logos kept by their images: the ones that link nowhere, and nebia's,
// which the page links to mogul's site
const IMAGES: Record<string, string> = {
	'e12b1a_02a23d6bcb6945dfb1b53ff554159668~mv2.png': "California Dreamin'",
	'e12b1a_07a90e01944f4c8cad992ec2290f7f4e~mv2.png': 'Nebia',
	'e12b1a_16a1070770564464a4d232e00b7c5e5b~mv2.png': 'Bolt',
	'e12b1a_283165693b834267b9b148cbc3321cf3~mv2.png': 'Cue',
	'e12b1a_393c04b6eb384745a650859a6dd1149c~mv2.png': 'Cannaly',
	'e12b1a_3a616cd13c4d4caea07a3efbd9838efb~mv2.png': 'OpenNest Labs',
	'e12b1a_c10aa9c2d983452d96194c3d6c676dae~mv2.png': 'Singu',
	'e12b1a_c3e71c28768e4f78ae4d4520e1e56fbc~mv2.png': 'Vantage Point'
};

const IMAGE = /(?:<a\b[^>]*\bhref="([^"]*)"[^>]*>\s*)?<img\b[^>]*\bsrc="https:\/\/static\.wixstatic\.com\/media\/([^"/]+)\//g;
const REALIZED = /✅\s*REALIZED/;
const FOLDED = /👻\s*GAME OVER/;
const NOT_A_SITE = /wixstatic|wix\.com|parastorage|babel\.ventures|youtube\.com|instagram\.com|linkedin\.com/i;
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
	const realizedAt = html.search(REALIZED);
	const foldedAt = html.search(FOLDED);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const match of html.matchAll(IMAGE)) {
		const [, href = '', image] = match;
		const at = match.index ?? 0;
		const site = href.replace(/&amp;/g, '&').trim();
		const host = /^https?:\/\//i.test(site) && !NOT_A_SITE.test(site) ? hostOf(site) : '';
		const named = IMAGES[image];
		const name = named ?? (host ? (NAMES[host] ?? domainName(host)) : '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const mark = foldedAt >= 0 && at > foldedAt ? 'Game Over' : realizedAt >= 0 && at > realizedAt ? 'Realized' : '';
		companies.push({
			name,
			category: mark ? `${mark}, Exited` : '',
			url: named || !host ? PAGE_URL : site
		});
	}
	if (companies.length === 0) {
		throw new Error('babel: no companies on the portfolio page');
	}

	return companies;
}
