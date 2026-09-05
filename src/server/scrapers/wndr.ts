import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.wndr.vc';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// the site is a client-rendered vite app — the served html is an empty shell —
// and the portfolio is baked into its javascript bundle as one array of
// [name, description, strategies, category, valuation] tuples, followed by the
// destructuring that names those fields. the bundle's filename carries a build
// hash, so it is read from the shell on every scrape rather than hardcoded.
//
// the company sites live in a separate object keyed by company name, and the
// slugs the tuples carry ("CyberDev", "vc") have their display labels in two
// small lookup objects ("Cyber / Dev", "Venture").

// the .map that unpacks the portfolio array; the minified argument names change
// between builds but the fields they are unpacked into do not
const UNPACK =
	/\.map\(\(\[[\w,$]*\]\)=>\(\{name:\w+,description:\w+,strategies:\w+,category:\w+,valuation:\w+\}\)\)/;

// both label objects lead with an "all" entry the portfolio itself never uses
const LABELS = /\{all:"All",([^{}]*)\}/g;

// scan backwards from `end` for the start of the array that closes there
function arrayBefore(js: string, end: number): string {
	let depth = 0;
	let inString = false;
	for (let i = end - 1; i >= 0; i--) {
		const ch = js[i];
		// walking backwards, a quote is an escape when an odd run of
		// backslashes precedes it
		if (ch === '"') {
			let slashes = 0;
			while (js[i - 1 - slashes] === '\\') slashes++;
			if (slashes % 2 === 0) inString = !inString;
		} else if (!inString) {
			if (ch === ']') depth++;
			else if (ch === '[' && --depth === 0) return js.slice(i, end);
		}
	}
	throw new Error('wndr: the portfolio array never opens');
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const shell = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!shell.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${shell.status}`);
	}
	const bundlePath = (await shell.text()).match(
		/<script[^>]*type="module"[^>]*src="([^"]+\.js)"/
	)?.[1];
	if (!bundlePath) {
		throw new Error('wndr: no module bundle in the page shell');
	}

	const bundleUrl = new URL(bundlePath, PAGE_URL).href;
	const resp = await fetch(bundleUrl, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${bundleUrl}: ${resp.status}`);
	}
	const js = await resp.text();

	const unpack = js.match(UNPACK);
	if (unpack?.index === undefined) {
		throw new Error('wndr: no portfolio array in the bundle');
	}
	const rows = JSON.parse(arrayBefore(js, unpack.index)) as [
		string,
		string,
		string[],
		string,
		number | null
	][];

	// "CyberDev" -> "Cyber / Dev", "vc" -> "Venture"; the two objects share no
	// keys, so one lookup serves both
	const labels = new Map<string, string>();
	for (const m of js.matchAll(LABELS)) {
		for (const pair of m[1].matchAll(/([\w$]+|"[^"]+"):"([^"]*)"/g)) {
			labels.set(pair[1].replace(/^"|"$/g, ''), pair[2]);
		}
	}

	// every "<key>":"<url>" in the bundle; only the company names are looked up,
	// so the team's linkedin pages and the like never match
	const sites = new Map<string, string>();
	for (const m of js.matchAll(/(?:"([^"\n]{1,60})"|([A-Za-z_$][\w$]*)):"(https?:\/\/[^"]+)"/g)) {
		sites.set(m[1] ?? m[2], m[3]);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [name, , strategies, category] of rows) {
		if (!name || seen.has(name)) continue;
		seen.add(name);
		const tags = (strategies ?? []).map((s) => labels.get(s) ?? s);
		// "Other" is the catch-all bucket — it names no sector
		const sector = labels.get(category) ?? category;
		if (sector && sector !== 'Other') tags.push(sector);
		companies.push({ name, category: tags.join(', '), url: sites.get(name) ?? '' });
	}

	if (companies.length === 0) {
		throw new Error('wndr: no companies in the portfolio array');
	}

	return companies;
}
