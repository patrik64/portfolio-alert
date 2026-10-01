import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.afore.vc';
const PAGE_URL = `${BASE_URL}/portfolio`;
const PACE_MS = 150;
const MAX_PAGES = 20;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// webflow: the portfolio page lists the fund's companies three ways. the
// success stories at the top name nobody in words; the main list does,
// twenty-five to a page with a link to the next, each company with its
// site, its industries and its city as the filters read them, kept as
// tags, and how the fund got out ("ACQ. BY IBM"), kept as "Acquired by
// IBM"; and a compact list below carries all of them, the success stories
// too, on every page, but stops at a hundred, as a webflow list does. so
// the main list is read through its pages, and the compact list for the
// companies the main list leaves out.

const LOADED_LIST = 'fs-cmsload-element="list"';
const ITEM = /(?=<div\b[^>]*\brole="listitem")/;
const NEXT = /<a\b[^>]*\bhref="\?(\w+_page=\d+)"[^>]*\bclass="w-pagination-next\b/;
const MAIN_NAME = /<h3 class="t-48 is-portfolio">([\s\S]*?)<\/h3>/;
const MAIN_SITE = /<a\b[^>]*\bhref="([^"]*)"[^>]*\bclass="portfolio-link\b/;
const FIELD = (name: string) => new RegExp(`fs-cmsfilter-field="${name}"[^>]*>([\\s\\S]*?)<\\/div>`, 'g');
const COMPACT_NAME = /<h3 class="t-48">([\s\S]*?)<\/h3>/;
const COMPACT_SITE = /<a\b[^>]*\bhref="([^"]*)"[^>]*\bclass="link-block-2\b/;
const COMPACT_CITY = /class="f-roboto t-24 text-semi-bold text-all-caps"[^>]*>([\s\S]*?)<\/div>/;
const SOLD = /<h3 class="t-48 aquire_tag[^"]*">([\s\S]*?)<\/h3>/;
const NOT_A_TAG = /^(?:all|other-(?:true|false))$/i;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// a buyer shouted in capitals or whispered in lower case is set right,
// word by word, short names like IBM left be: "PALO ALTO NETWORKS" ->
// "Palo Alto Networks", "empower" -> "Empower"
const buyerName = (s: string) =>
	s
		.split(' ')
		.map((word) =>
			word === word.toLowerCase() || (word === word.toUpperCase() && word.length > 3)
				? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
				: word
		)
		.join(' ');

// "ACQ. BY IBM" -> "Acquired by IBM"
function outcome(sold: string): string {
	const buyer = sold.replace(/^acq(?:uired|\.)?\s*by\s+/i, '');
	return buyer === sold ? sold : `Acquired by ${buyerName(buyer)}`;
}

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	const add = (name: string, site: string, tags: string[], sold: string) => {
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) return;
		seen.add(name.toLowerCase());
		const went = sold ? outcome(tag(sold)) : '';
		companies.push({
			name,
			category: [...tags, went, went ? 'Exited' : '']
				.filter((t, i, all) => t && !NOT_A_TAG.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	};

	let compact = '';
	let url = PAGE_URL;
	for (let page = 0; page < MAX_PAGES && url; page++) {
		const html = await fetchText(url);
		const at = html.indexOf(LOADED_LIST);
		const below = at < 0 ? -1 : html.indexOf(LOADED_LIST, at + LOADED_LIST.length);
		if (at < 0) {
			throw new Error(`afore: no list of companies on ${url}`);
		}
		const main = html.slice(at, below < 0 ? undefined : below);
		if (page === 0 && below >= 0) compact = html.slice(below);
		for (const item of main.split(ITEM).slice(1)) {
			add(
				clean(item.match(MAIN_NAME)?.[1] ?? ''),
				unescape(item.match(MAIN_SITE)?.[1] ?? '').trim(),
				[...item.matchAll(FIELD('industries')), ...item.matchAll(FIELD('Locations'))].map(([, label]) => tag(label)),
				clean(item.match(SOLD)?.[1] ?? '')
			);
		}
		const next = main.match(NEXT)?.[1];
		url = next ? `${PAGE_URL}?${next}` : '';
		if (url) await new Promise((resolve) => setTimeout(resolve, PACE_MS));
	}
	for (const item of compact.split(ITEM).slice(1)) {
		add(
			clean(item.match(COMPACT_NAME)?.[1] ?? ''),
			unescape(item.match(COMPACT_SITE)?.[1] ?? '').trim(),
			[...[...item.matchAll(FIELD('tag'))].map(([, label]) => tag(label)), tag(item.match(COMPACT_CITY)?.[1] ?? '')],
			clean(item.match(SOLD)?.[1] ?? '')
		);
	}
	if (companies.length === 0) {
		throw new Error('afore: no companies on the portfolio page');
	}

	return companies;
}
