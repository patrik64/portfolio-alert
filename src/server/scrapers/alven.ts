import type { ScrapedCompany } from './types';

const BASE_URL = 'https://alven.co';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// framer: the portfolio page shows its first thirty companies, and "Exits"
// its first thirty exits, each loading the rest as the visitor scrolls,
// from the site's cms collection of companies, which framer serves as a
// binary file of its own, read here: each company's name, its sector
// ("SaaS", "Marketplaces"), kept as a tag, its site, whether it is active
// or an exit, and for an exit who it went to ("Getaround"), kept as
// "Acquired by Getaround", a listing as "IPO" or "IPO (EURONEXT)", and a
// sale to a financial investor as such. the files' places change with
// each publish, so the page is read for the site's script, the script for
// the collection's, and that for its files, each run; the run fails when a
// company the page shows is not among the active ones.

// the collection of companies, and its fields, by the ids framer gives them
const COLLECTION = 'a2PXWlwcT';
const NAME = 'FrHY4z6MT';
const SLUG = 'OSyHVYNW6';
const WEBSITE = 'dhvFbe8ww';
const SECTOR = 'ro9fTpv3q';
const BUYER = 'hI7NM9qGY';
const STANDING = 'iUstzfGer';
const ACTIVE = 'HtffrRzDD';
const EXIT = 'qGol1i7B7';

const SCRIPT = /https:\/\/framerusercontent\.com\/sites\/[\w-]+\/script_main\.[\w-]+\.mjs/;
// the site script loads the collection through a small module of its own
const LOADER = new RegExp(`\\b${COLLECTION}:async\\(\\)=>\\(await import\\(\`\\./([\\w.-]+\\.mjs)\`\\)`);
const MODULE = new RegExp(`\\./(${COLLECTION}\\.[\\w-]+\\.mjs)`);
const CHUNK = /new URL\(`\.\/([\w-]+-chunk-default-\d+\.framercms)`,`(https:\/\/framerusercontent\.com\/modules\/[^`]+)`\)/g;
const SHOWN = /\bhref="\.\/portfolio\/([^"#?]+)"/g;
// field kinds held as text, after their length: colour, enum, link, image, string
const TEXT = new Set([3, 5, 7, 10, 12]);
const RICH_TEXT = 11;
const STEALTH = /^stealth\b/i;

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#0?38;|&amp;/g, '&');

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => unescape(s).replace(/\s+/g, ' ').trim().replace(/\s*,\s*/g, ' / ');

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

// a chunk of the collection: a count of items, then for each a count of
// fields, each its name, a byte for its kind and its value
function decode(buffer: ArrayBuffer): Map<string, string>[] {
	const view = new DataView(buffer);
	const bytes = new Uint8Array(buffer);
	const utf8 = new TextDecoder();
	let at = 0;
	const text = () => {
		const length = view.getUint32(at);
		at += 4;
		const value = utf8.decode(bytes.subarray(at, at + length));
		at += length;
		return value;
	};
	const items: Map<string, string>[] = [];
	const count = view.getUint32(at);
	at += 4;
	for (let i = 0; i < count; i++) {
		const fields = new Map<string, string>();
		const n = view.getUint16(at);
		at += 2;
		for (let f = 0; f < n; f++) {
			const name = text();
			const kind = bytes[at++];
			if (TEXT.has(kind)) fields.set(name, text());
			else if (kind === RICH_TEXT) {
				if (bytes[at++]) text();
			} else if (kind === 4 || kind === 8) at += 8;
			else if (kind === 1) at += 1;
			else if (kind !== 0) throw new Error(`alven: a field of an unknown kind (${kind}) in the cms data`);
		}
		items.push(fields);
	}
	return items;
}

// how an exit went, from who it went to
function outcome(buyer: string): string {
	if (!buyer) return '';
	if (/^ipo$/i.test(buyer)) return 'IPO';
	if (/\bstock exchange\b|\beuronext\b|\bnasdaq\b|\bnyse\b/i.test(buyer)) return `IPO (${tag(buyer)})`;
	if (/^financial (?:investor|exit)$/i.test(buyer)) return 'Sold to a financial investor';
	return `Acquired by ${tag(buyer)}`;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const page = await fetchText(PAGE_URL);
	const script = page.match(SCRIPT)?.[0];
	if (!script) {
		throw new Error('alven: no site script on the portfolio page');
	}
	const main = await fetchText(script);
	const loader = main.match(LOADER)?.[1];
	const module = (loader ? (await fetchText(new URL(loader, script).href)).match(MODULE) : main.match(MODULE))?.[1];
	if (!module) {
		throw new Error('alven: the site script names no collection of companies');
	}
	const source = await fetchText(new URL(module, script).href);
	const chunks = [...new Set([...source.matchAll(CHUNK)].map(([, file, from]) => new URL(file, from).href.replace('/modules/', '/cms/')))];
	if (chunks.length === 0) {
		throw new Error('alven: the collection names no files');
	}

	const items: Map<string, string>[] = [];
	for (const chunk of chunks) {
		const resp = await fetch(chunk, { headers: { 'User-Agent': UA } });
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${chunk}: ${resp.status}`);
		}
		items.push(...decode(await resp.arrayBuffer()));
	}

	// every company the page shows must be among the active ones
	const active = new Set(items.filter((item) => item.get(STANDING) === ACTIVE).map((item) => item.get(SLUG)));
	const missing = [...page.matchAll(SHOWN)].map(([, slug]) => slug).filter((slug) => !active.has(slug));
	if (missing.length > 0) {
		throw new Error(`alven: shown on the page but not active in the cms data: ${[...new Set(missing)].join(', ')}`);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of items) {
		const standing = item.get(STANDING);
		if (standing !== ACTIVE && standing !== EXIT) continue;
		const name = unescape(item.get(NAME) ?? '').replace(/\s+/g, ' ').trim();
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const out = standing === EXIT;
		const went = out ? outcome((item.get(BUYER) ?? '').trim()) : '';
		let site = '';
		try {
			site = String(JSON.parse(item.get(WEBSITE) || '""')).trim();
		} catch {
			// a link that will not parse leaves the company's page
		}
		const slug = item.get(SLUG) ?? '';
		companies.push({
			name,
			category: [tag(item.get(SECTOR) ?? ''), went, out ? 'Exited' : '']
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : slug ? `${BASE_URL}/portfolio/${slug}` : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('alven: no companies in the cms data');
	}

	return companies;
}
