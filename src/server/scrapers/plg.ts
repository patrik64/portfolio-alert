import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.plgventures.com/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// squarespace. the portfolio is a run of image blocks on the front page: a
// logo linked to the company and nothing else — no caption, no alt text, no
// heading. the page's own json view returns the same blocks, so there is no
// name to be had anywhere on the site.
//
// so the company is named by its address, and the logo file is allowed to name
// it instead where the file spells a brand rather than the fund's template:
// most of them are "PLG_Logo_Template" with a mangled suffix, but the ones
// that are not give Charma, whose address still says workpatterns, and
// Flowspace, whose address is only flow.space.
//
// what that cannot do is put the spaces back into an address, so a handful
// read as one word — Antmoney, Citruslabs, Firstresonance. they are at least
// steady, which matters more here: a company is known by its name, so a name
// that moved would read as the old one leaving and a new one arriving.
//
// the blocks with no link are the fund's own section art and a portrait.

const BLOCK = /<div class="sqs-block image-block sqs-block-image"/g;
const SITE = /href="(https?:\/\/(?!(?:www\.)?plgventures|[^"]*squarespace)[^"]+)"/;
const LOGO = /<img[^>]*src="(https:\/\/images\.squarespace-cdn\.com\/[^"?]+)/;
// what a company puts in front of its brand to get a free address
const DECORATION = /^(?:hello|with|get|try|use|join|my|the)(?=[a-z]{4,})/;
// a host that is the site's own front door rather than the brand
const DOORWAY = /^(?:welcome|app|my)$/;
// a logo file that spells a brand, rather than the fund's template or what is
// left of a name that has been url-encoded a few times over
const BRAND = /^[A-Za-z][A-Za-z &.-]{3,}$/;

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

const titled = (s: string) =>
	s === s.toLowerCase() ? s.replace(/\b[a-z]/g, (c) => c.toUpperCase()) : s;

// the brand as the logo file spells it, if it spells one at all
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
			// squarespace keeps the slide number the logo was exported from
			.replace(/\.\d+$/, '')
			.replace(/PLG[_ +]?Logo[_ +]?(?:Template)?/i, '')
			.replace(/[+_]+/g, ' ')
			.replace(/\s*\b\d+\b\s*$/, '')
	);
};

const fromHost = (url: string) => {
	try {
		const parts = new URL(url).hostname.replace(/^www\./, '').split('.');
		const brand = DOORWAY.test(parts[0]) ? parts[1] : parts[0];
		return brand.replace(DECORATION, '');
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

	const starts = [...html.matchAll(BLOCK)].map((m) => m.index);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [i, at] of starts.entries()) {
		const block = html.slice(at, starts[i + 1] ?? html.length);

		const url = block.match(SITE)?.[1];
		if (!url) continue;

		const logo = fromLogo(block.match(LOGO)?.[1] ?? '');
		const name = titled(BRAND.test(logo) ? logo : fromHost(url));
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		companies.push({ name, category: '', url });
	}

	if (companies.length === 0) {
		throw new Error('plg: no companies on the portfolio page');
	}

	return companies;
}
