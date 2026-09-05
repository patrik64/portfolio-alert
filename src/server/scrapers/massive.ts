import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://massive.vc/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace, one page, and the portfolio is a wall of logos under a heading
// with nothing else to it: no alt text on any of them, no names, no sectors.
// the fund's four themes are on the same page but as prose about the fund
// rather than as anything filed against a company, so the category is empty.
//
// what there is is a link out and a file name, and between them they name a
// company: the file where the two spell something of each other — Suite for
// suitestudios.io, Path for drinkpathwater.com, Artyc for shipartyc.com — and
// the address where they do not. squarespace's own asset ids and the fund's
// own name come off the file first, along with the words a designer leaves in
// one: logo, grey, transparent.
//
// the wall is read from its heading down, and only a logo linked off the site
// counts, which leaves out the fund's own mark at the foot of the page and the
// team's photographs below it.

const HEADING = /PORTFOLIO/;
const LOGO = /<img[^>]*?\bdata-sqsp-image-block-image\b[^>]*>/g;
const LINK = /<a\b[^>]*?\bclass="sqs-block-image-link[^"]*"[^>]*?\bhref="([^"]*)"/g;
const FILE = /data-src="([^"]*)"/;
// what squarespace and a designer leave around a file's own name
const ASSET_ID = /^[0-9a-f]{16,}_/;
const COPY = /\+?\(\d+\)$/;
const SIZED = /-p-\d+$|@\d+x$/;
const FUND = /^massivevc[-_]?/i;
const NOISE = /\b(?:logos?|grey|gray|white|black|transparent|trans|final|copy)\b/gi;
// second levels that are not the brand
const GENERIC = new Set(['com', 'co', 'net', 'org', 'io', 'ai', 'app', 'life', 'vc', 'tech']);
// the fund's own pages, which are not a company's
const NOT_A_COMPANY = /\/\/(?:[a-z0-9-]+\.)*massive\.vc\b/i;

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const titled = (s: string) =>
	s === s.toLowerCase() ? s.replace(/\b[a-z]/g, (c) => c.toUpperCase()) : s;

const fromFile = (src: string) => {
	let file = decodeURIComponent(src.split('?')[0].split('/').pop() ?? '');
	file = file.replace(/\.[a-z0-9]+$/i, '').replace(ASSET_ID, '').replace(COPY, '').replace(SIZED, '');
	return clean(file.replace(FUND, '').replace(/[-_]+/g, ' ').replace(NOISE, ' '));
};

const fromHost = (url: string) => {
	try {
		const labels = new URL(url).hostname.replace(/^www\./, '').split('.');
		if (labels.length > 1) labels.pop();
		if (labels.length > 1 && GENERIC.has(labels[labels.length - 1])) labels.pop();
		return labels[labels.length - 1] ?? '';
	} catch {
		return '';
	}
};

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const from = html.search(HEADING);
	if (from === -1) {
		throw new Error('massive: the page no longer heads its portfolio');
	}
	const wall = html.slice(from);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let previous = 0;
	for (const logo of wall.matchAll(LOGO)) {
		const at = logo.index;
		// a link belongs to a logo only if it stands between it and the one before
		const url = [...wall.slice(previous, at).matchAll(LINK)].at(-1)?.[1] ?? '';
		previous = at;
		if (!/^https?:\/\//i.test(url) || NOT_A_COMPANY.test(url)) continue;

		const stem = fromFile(logo[0].match(FILE)?.[1] ?? '');
		const host = fromHost(url);
		// the file is believed where it and the address spell something of each
		// other, and only when it says enough to be a name
		const spelled =
			stem && key(stem).length >= 4 && (key(host).includes(key(stem)) || key(stem).includes(key(host)));
		const name = titled(spelled ? stem : host);
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({ name, category: '', url });
	}

	if (companies.length === 0) {
		throw new Error('massive: no companies on the portfolio wall');
	}

	return companies;
}
