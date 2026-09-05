import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.nxtp.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow, the whole portfolio served — no paging, the fund's dropdowns filter
// it in the browser. a card carries a good deal: what the fund files the
// company under, the countries it works in, whether it is still held, its
// founders, a line about what it does, its linkedin and its own address.
//
// what no card carries is the company's name. the grid is logos, and opening
// one shows the same logo over the write-up: the name is inside the artwork
// and nowhere in the page as text. so the fund names a company in exactly one
// place, the file it uploaded the logo as, and that is read.
//
// webflow puts a hash in front of an uploaded filename and a counter after it,
// and the fund sometimes files a logo under what it is rather than who it is —
// Primary-Logo-FullBlack, image-removebg-preview. so the name is only taken
// from the file where the company's own address bears it out, and where it
// does not, the address names the company instead. that catches the two the
// fund misspelled as well: chaski for chazki.com, properatti for properati.com.
//
// the fund calls a company it has exited an Exit; that is the one word this
// records as Exited, the way every other fund's is.

const ITEM = 'class="company-wrap w-dyn-item"';
const SITE = /<a href="([^"]+)"[^>]*class="company-logo-link/;
const LOGO = /class="company-logo-link[^"]*"[^>]*>\s*<img src="([^"]+)"/;
const VERTICAL = /class="vertical-text">([\s\S]*?)<\/div>/g;
const PLACE = /fs-list-field="hq" class="loc">([\s\S]*?)<\/div>/g;
const STATUS = /fs-list-field="status">([\s\S]*?)<\/div>/;
const EXIT = /^exit(ed)?$/i;
// webflow's own hash in front of an uploaded name
const UPLOAD = /^[0-9a-f]{16,}_/;
// the counter is always set off from the name, so that the 0 of auth0 is not
// read as one
const COUNTER = /(?:[\s_-]+\d+|\s*\(\d+\))$/;
// what the fund files a logo under when it files it under what it is
const ARTWORK = /[\s_-]*(logo|logotipo|logotype|imagotype|isotipo|color|black|white)$/i;
// an address that leads with a word a brand is not, once the file has failed
const PREFIX = /^(use|get|try|join)(?=[a-z0-9]{3,})/i;

const un = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => un(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a vertical written with a comma in it would
// read as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// a name and an address are compared on their letters and digits alone
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const host = (url: string) => {
	try {
		return new URL(url).hostname.replace(/^www\./i, '');
	} catch {
		return '';
	}
};

// the name the fund uploaded the logo under, less webflow's own additions
const fromLogo = (url: string) => {
	let stem = clean(decodeURIComponent((url.split('/').pop() ?? '').replace(/\+/g, ' ')));
	stem = stem.replace(/\.[a-z0-9]+$/i, '').replace(UPLOAD, '');
	// the artwork words come off last to first, since a file is filed as
	// Strike-Logotype-Black before it is filed as Strike
	for (let pass = 0; pass < 3; pass++) stem = stem.replace(COUNTER, '').replace(ARTWORK, '');
	return stem.replace(COUNTER, '').trim();
};

// the company's own address, read as the name the file did not give
const fromSite = (site: string) => {
	const label = host(site).split('.')[0].replace(PREFIX, '');
	return label ? label.charAt(0).toUpperCase() + label.slice(1) : '';
};

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const items = html.split(ITEM).slice(1);
	if (items.length === 0) {
		throw new Error('nxtp: the portfolio is no longer written into the page');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of items) {
		const site = clean(item.match(SITE)?.[1] ?? '');
		const written = fromLogo(item.match(LOGO)?.[1] ?? '');
		const name =
			written && key(written) && key(host(site)).includes(key(written))
				? written
				: fromSite(site);
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const status = clean(item.match(STATUS)?.[1] ?? '');
		companies.push({
			name,
			category: [
				...[...item.matchAll(VERTICAL)].map((m) => tag(m[1])),
				...[...item.matchAll(PLACE)].map((m) => tag(m[1])),
				EXIT.test(status) ? 'Exited' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: site === '#' ? '' : site
		});
	}

	if (companies.length === 0) {
		throw new Error('nxtp: no companies in the portfolio');
	}

	return companies;
}
