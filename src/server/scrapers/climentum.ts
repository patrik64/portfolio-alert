import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://climentum.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// framer, the grid laid out by hand rather than drawn from a collection:
// every card is an instance of one component — a logo, a photo, a line
// about the company and a link to the fund's piece on it — placed anew for
// each filter tab and each screen size, with the ones past the first few
// shown only behind "Load More". the page renders the first few; the rest
// live only in the page's script, one of the site's chunks, whose name
// changes with every publish, so the chunks the page loads are searched for
// the one placing the cards.
//
// a card names its company nowhere but in its logo, and its line is not a
// safe guide either — a few copies were left with the component's default
// line, "Decentral energy storage deployment at industrial sites", under
// another company's logo. so a card is known by the logo image it sets,
// and one that sets none shows the component's own, scale energy's. the
// names below are what the logos read, filled out as the fund writes them
// in its pieces on the companies ("Aegir Insights", "Jolt Electrodes"); a
// logo not listed here has nothing to name it and is left out until it is
// added. a card drawn as the component's exit variant wears an "Exit"
// label. the tabs are not read, so no company carries a sector.
const LOGOS: Record<string, string> = {
	'3qyYbBHM9tGCJJxLwF2xlCShL0': 'Nature Robots',
	'4mxeacEG9UXTKpYHkzN542eSNUY': 'Rail-Flow',
	AI9DAZvqGCGDNFeTyxhBYWzT1Q: 'Qvantum',
	BZkdSJl50xd2PXIQdrqioS4uaXg: 'ecoLocked',
	Cm1VKYvyFAMKe59YKaGICaYx4: 'Entocycle',
	FHPGyXX1ZwEtjgKY2ddj3JFCDM: 'Kärnfull Next',
	KyRyo3MUFZBCOLaToQUQXnzTL0: 'Scale Energy',
	Lp8HevsLP0JYnwdCOoQyIWs: 'Enerin',
	MpzMMnu5zWFnXrxgMmZlqpdQA: 'Rodinia Generation',
	PGa1V1nYv1Nwg1emrvJORiCrg: 'ZeroPoint',
	S8HI92NMlhS4hPH8bkvVsqVOwcM: 'Entocycle',
	gBKQT5HCDRvErAZEfjHX1Ri8QE: 'Continuum',
	gkA7FdB1UNnVDmOu5ETyyZdRc4: 'Jolt Electrodes',
	jai787Ewi25CfHVCZIv2zJSdQ: 'Novatron',
	l4g65u9PDiAv16hoaWdtDhhH0: 'ecoLocked',
	o6VZXKa4aZ5cXspHqf8TVyUnIo: 'Wayout',
	szXAKevGfajpOun6IDFcalUSqko: 'Aegir Insights',
	xZCO4vXYQof1ZSRhu5guhx3eS4g: 'Jolt Electrodes',
	y7AbxLVEZ2Zm9mC64vhIrjI7M: 'Continuum',
	zWXrMIkMVNgZdQrhEB2RW9RWYY: 'One Five'
};

const CHUNK = /https:\/\/framerusercontent\.com\/sites\/[\w-]+\/[\w.-]+\.mjs/g;
// the component's properties by the ids framer gave them in the designer:
// the logo, and the line, which a card sets after all its others
const LINE = /,width:`[^`]*`,yC003PqF9:`/g;
const LOGO = /\bTF2QaYnFQ:J\(\{[^{}]*?\bsrc:`https:\/\/framerusercontent\.com\/images\/([\w-]+)\./;
const DEFAULT_LOGO = /\bTF2QaYnFQ:\w+\?\?\w+\.TF2QaYnFQ\?\?\{[^{}]*?\bsrc:`https:\/\/framerusercontent\.com\/images\/([\w-]+)\./;
const VARIANT = /\bvariant:\w+\(`(\w+)`\)/;
// the component's variants by the names given them: "Variant 2 Exit"
const EXIT_VARIANT = /"[^"]*\bExit\b[^"]*":`(\w+)`/;

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await fetchText(PAGE_URL);
	const chunks = [...new Set([...html.matchAll(CHUNK)].map(([url]) => url))];
	let code = '';
	for (const url of chunks) {
		const source = await fetchText(url);
		if (source.search(LINE) >= 0 && LOGO.test(source)) {
			code = source;
			break;
		}
	}
	if (!code) {
		throw new Error("climentum: none of the page's scripts places the portfolio cards");
	}
	const fallback = code.match(DEFAULT_LOGO)?.[1] ?? '';
	const exit = code.match(EXIT_VARIANT)?.[1];

	const exited = new Map<string, boolean>();
	for (const line of code.matchAll(LINE)) {
		// a card's properties run from its layout id to its line
		const props = code.slice(code.lastIndexOf('layoutId:', line.index), line.index);
		const name = LOGOS[props.match(LOGO)?.[1] ?? fallback];
		if (!name) continue;
		const variant = props.match(VARIANT)?.[1];
		exited.set(name, (exited.get(name) ?? false) || (!!exit && variant === exit));
	}
	if (exited.size === 0) {
		throw new Error('climentum: no card on the portfolio page shows a known logo');
	}

	return [...exited].map(([name, out]) => ({ name, category: out ? 'Exited' : '', url: PAGE_URL }));
}
