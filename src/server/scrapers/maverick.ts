import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.maverickcapital.com';
const PAGE_URL = `${BASE_URL}/venturesportfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// the page is two kilobytes of nothing — a react app with an empty root and an
// ssr outlet that was never filled — so the portfolio is in the script it
// loads, whose name carries a build hash and is therefore taken from the page
// rather than written down here.
//
// since september 2026 the script holds the portfolio once, as a list of
// records that each carry a name, a logo, and what the fund says about the
// company: its sectors (as slugs), the stage it first partnered at, its
// address, and how it ended — $ASO, M&A, Acquired by Opti9, "$AMAM | Acquired
// by Johnson & Johnson". the list is found by shape rather than by name,
// since a bundler renames everything on each build: it is the longest list
// of records pairing a name with a logo and an address. (it used to be three
// lists, one per tab, and the roster among them carried no addresses.)

const BUNDLE = /<script[^>]*\bsrc="(\/assets\/index-[A-Za-z0-9_-]+\.js)"/;
const ARRAY = /=\s*\[\{name:"/g;
const RECORD = /(?=\{name:")/;
const NAME = /^\{name:"([^"]*)"/;
const NOTE = /subText:"([^"]*)"/i;
const SECTORS = /sectors:\[([^\]]*)\]/;
const QUOTED = /"([^"]*)"/g;
const STAGE = /firstPartnered:"([^"]*)"/;
const SITE = /websiteUrl:"([^"]*)"/;
// what marks the roster of companies out from the lists of people and causes
const LOGOS = 'logoUrl:';
const SITES = 'websiteUrl:"';

// the sectors are slugs now; these are the fund's own spellings of them
const SECTOR_LABELS: Record<string, string> = {
	ai: 'AI',
	consumer: 'Consumer',
	enterprise: 'Enterprise',
	healthcare: 'Healthcare'
};

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const label = (slug: string) =>
	SECTOR_LABELS[slug.toLowerCase()] ?? (slug ? slug[0].toUpperCase() + slug.slice(1) : '');
// the addresses are typed by hand, some without a scheme
const address = (s: string) => (s && !/^https?:\/\//i.test(s) ? `https://${s}` : s);

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

// an array written straight into the script ends where its own brackets
// balance, quotes and escapes aside
function arrayAt(script: string, from: number): string {
	let depth = 0;
	let quote = '';
	let escaped = false;
	for (let at = from; at < script.length; at++) {
		const c = script[at];
		if (quote) {
			if (escaped) escaped = false;
			else if (c === '\\') escaped = true;
			else if (c === quote) quote = '';
		} else if (c === '"' || c === "'" || c === '`') quote = c;
		else if (c === '[') depth++;
		else if (c === ']' && --depth === 0) return script.slice(from, at + 1);
	}
	return '';
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const page = await fetchText(PAGE_URL);
	const bundle = page.match(BUNDLE)?.[1];
	if (!bundle) {
		throw new Error('maverick: the page names no script of its own');
	}
	const script = await fetchText(`${BASE_URL}${bundle}`);

	let roster: string[] = [];
	for (const found of script.matchAll(ARRAY)) {
		const list = arrayAt(script, script.indexOf('[', found.index));
		if (!list.includes(LOGOS) || !list.includes(SITES)) continue;
		const records = list.split(RECORD).filter((record) => NAME.test(record));
		if (records.length > roster.length) roster = records;
	}
	if (roster.length === 0) {
		throw new Error('maverick: the script holds no roster of companies');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const record of roster) {
		const name = clean(record.match(NAME)?.[1] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const sectors = [...(record.match(SECTORS)?.[1] ?? '').matchAll(QUOTED)].map((one) =>
			label(clean(one[1]))
		);
		companies.push({
			name,
			category: [...sectors, clean(record.match(STAGE)?.[1] ?? ''), clean(record.match(NOTE)?.[1] ?? '')]
				.filter(Boolean)
				.join(', '),
			url: address(clean(record.match(SITE)?.[1] ?? ''))
		});
	}

	return companies;
}
