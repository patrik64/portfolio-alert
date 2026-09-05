import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.roguewmn.com/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// static webflow, the portfolio a grid on the fund's one page. a tile shows a
// logo and, on hover, the founders and what the company does — but never the
// company's name. the logo links nowhere; the address is the third of three
// icons beneath, the one that is not x or linkedin.
//
// so the logo's filename names the company. the fund keeps them tidy —
// "seven starling.png", "_edify.png", "pointz site.png" — and they are used as
// written, minus the leading underscore and the trailing "site".
//
// two rows carry the fund's own slips: cmodel's tile has future family's logo
// on it, and stratesea's address is a copy of the row above. a filename that
// would repeat a name already taken gives way to the company's own domain, so
// nothing is lost to either.

const ITEM =
	/(?=<div id="w-node-[^"]*" data-w-id="[^"]*" class="spark-wrapped-square-team-2 spark-stacked">)/;
const LOGO = /<img src="([^"]+)"/;
const LINK = /<a href="(https?:\/\/[^"]+)"[^>]*class="social-link/g;
const SOCIAL = /(x\.com|twitter\.com|linkedin\.com|facebook\.com|instagram\.com)/i;
// what the fund adds to a logo file besides the company
const DRESSING = /^(site|logos?|final|new|\d+)$/i;
const HASH_PREFIX = /^[0-9a-f]{18,}_/;

const capitalize = (s: string) =>
	s
		.split(' ')
		.filter(Boolean)
		.map((w) => (/^[a-z]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w))
		.join(' ');

function domainLabel(url: string): string {
	try {
		const parts = new URL(url).hostname.replace(/^www\./, '').toLowerCase().split('.');
		return parts.length >= 2 ? parts[parts.length - 2] : (parts[0] ?? '');
	} catch {
		return '';
	}
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
		const site =
			[...item.matchAll(LINK)].map((m) => m[1]).find((u) => !SOCIAL.test(u)) ?? '';

		const file = decodeURIComponent(item.match(LOGO)?.[1]?.split('/').pop() ?? '')
			.replace(HASH_PREFIX, '')
			.replace(/\.\w+$/, '')
			.replace(/^_+/, '');
		const fromFile = capitalize(
			file
				.split(/[^A-Za-z0-9]+/)
				.filter((w) => w && !DRESSING.test(w))
				.join(' ')
		);

		// the domain stands in where the filename says nothing, or would repeat
		// a name the grid has already used
		const name = !fromFile || seen.has(fromFile) ? capitalize(domainLabel(site)) : fromFile;
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({ name, category: '', url: site });
	}

	if (companies.length === 0) {
		throw new Error('rogue: no companies on the portfolio page');
	}

	return companies;
}
