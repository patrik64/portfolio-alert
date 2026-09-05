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
// the script holds the portfolio three times over, once per tab: all of it,
// the ones the fund still holds, and the handful it features. they are found by
// shape rather than by name, since a bundler renames everything on each build:
// the roster is the longest list of records that pair a name with a logo, and
// what is known about a company beyond its name is in the shorter lists, the
// ones whose records carry an address.
//
// so a hundred and thirty-four companies come back, sixty-five of them with
// something said about them — a sector, or how it ended: $ASO, M&A, Acquired
// by Opti9, "$AMAM | Acquired by Johnson & Johnson". only the twenty-two the
// fund features carry an address, and the rest keep none rather than one
// guessed at.

const BUNDLE = /<script[^>]*\bsrc="(\/assets\/index-[A-Za-z0-9_-]+\.js)"/;
const ARRAY = /=\s*\[\{name:"/g;
const RECORD = /(?=\{name:")/;
const NAME = /^\{name:"([^"]*)"/;
const NOTE = /subtext:"([^"]*)"/;
const SECTORS = /sectors:\[([^\]]*)\]/;
const QUOTED = /"([^"]*)"/g;
const SITE = /websiteUrl:"([^"]*)"/;
// a list that says more about a company than its name and its logo
const DETAILED = 'websiteUrl:"';
// a list that is the roster of companies rather than of anything else
const LOGOS = 'logoUrl:';

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

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
	const known = new Map<string, { sectors: string[]; url: string }>();
	for (const found of script.matchAll(ARRAY)) {
		const list = arrayAt(script, script.indexOf('[', found.index));
		const records = list.split(RECORD).filter((record) => NAME.test(record));
		if (records.length === 0) continue;

		if (list.includes(DETAILED)) {
			for (const record of records) {
				const name = clean(record.match(NAME)?.[1] ?? '');
				if (!name) continue;
				const said = known.get(name) ?? { sectors: [], url: '' };
				const sectors = record.match(SECTORS)?.[1];
				if (sectors) said.sectors = [...sectors.matchAll(QUOTED)].map((one) => clean(one[1]));
				said.url = said.url || clean(record.match(SITE)?.[1] ?? '');
				known.set(name, said);
			}
		} else if (list.includes(LOGOS) && records.length > roster.length) {
			roster = records;
		}
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

		const said = known.get(name);
		companies.push({
			name,
			category: [...(said?.sectors ?? []), clean(record.match(NOTE)?.[1] ?? '')]
				.filter(Boolean)
				.join(', '),
			url: said?.url ?? ''
		});
	}

	return companies;
}
