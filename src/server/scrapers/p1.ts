import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.p1.ventures/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace. the portfolio is one gallery of logos, each linked to the
// company: no caption, no heading, no alt text beyond the file name, and the
// page's own json view returns an empty body because the gallery is a 7.1
// section. so there is no name and no sector anywhere on the site, and the
// category is empty.
//
// the company is therefore named by its address, and the logo file is allowed
// to supply the capitals where the two spell the same thing. the file is only
// trusted that far: it says Collab for callab.ai and Subsabse for
// subsbase.com, and the fund's own links are right both times.
//
// nor is an upper-case file trusted, because that is how a logo gets exported
// rather than how a brand is written — LENGO is Lengo and BRASS is Brass. only
// a file that mixes cases knows something the address does not, which is how
// MoneyBadger keeps its capital B.
//
// what none of that can do is put the spaces back into an address, so a few
// read as one word: Accordpartners, Kotanipay, Reliancehmo, Yallaeksab. they
// are at least steady, which matters more here — a name that moved would read
// as the old company leaving and a new one arriving.
//
// one logo in the gallery is linked to nothing, so it has neither a name nor
// an address and is left out.

const ITEM = /<figure class="gallery-grid-item[^"]*">([\s\S]*?)<\/figure>/g;
const SITE = /href="\s*(https?:\/\/[^"\s]+)/;
const LOGO = /data-src="(https:\/\/images\.squarespace-cdn\.com\/[^"?]+)"/;

// what a company puts in front of its brand to get a free address
const DECORATION = /^(?:hello|hey|with|get|try|use|join|my|the)(?=[a-z]{3,})/;
// a logo file that spells a brand, rather than a squarespace asset id or the
// name of the slide deck the logo was pulled out of
const BRAND = /^[A-Za-z][A-Za-z &.'-]{2,}$/;
// a file that mixes cases knows something the address does not; one written
// all one way does not
const mixed = (s: string) => /[a-z]/.test(s) && /[A-Z]/.test(s);

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

const titled = (s: string) =>
	s === s.toLowerCase() ? s.replace(/\b[a-z]/g, (c) => c.toUpperCase()) : s;

// the same brand written two ways — spaces, hyphens and capitals set aside
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const fromLogo = (src: string) => {
	let file = src.split('/').pop() ?? '';
	for (let i = 0; i < 8; i++) {
		const once = decodeURIComponent(file);
		if (once === file) break;
		file = once;
	}
	return clean(
		file
			.replace(/\.[a-z0-9]+$/i, '')
			.replace(/[+_]+/g, ' ')
			// squarespace numbers the copies of a file, and the fund numbers the
			// slide each logo came off
			.replace(/[\s-]*\d+\s*$/, '')
			.replace(/\blogos?\b/gi, '')
			// "logoPaymee", where the word is stuck to the front of the brand
			.replace(/^logos?(?=[A-Z])/, '')
	);
};

const fromHost = (url: string) => {
	try {
		const host = new URL(url).hostname.replace(/^www\./, '');
		return (host.split('.')[0] ?? '').replace(DECORATION, '');
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

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, item] of html.matchAll(ITEM)) {
		const url = item.match(SITE)?.[1];
		if (!url) continue;

		const host = fromHost(url);
		if (!host) continue;

		const logo = fromLogo(item.match(LOGO)?.[1] ?? '');
		const spelled = BRAND.test(logo) && key(logo) === key(host) && mixed(logo);
		// an address writes a two-word brand with a hyphen, so it is read as the
		// space it stands in for
		const name = spelled ? logo : titled(host.replace(/-+/g, ' '));
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({ name, category: '', url });
	}

	if (companies.length === 0) {
		throw new Error('p1: no companies in the portfolio gallery');
	}

	return companies;
}
