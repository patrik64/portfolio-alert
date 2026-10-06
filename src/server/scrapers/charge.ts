import type { ScrapedCompany } from './types';

const BASE_URL = 'https://charge.vc';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// framer, since october 2026 (the site was nuxt before): the portfolio page
// draws a score of cards and loads the rest as the visitor scrolls, from
// the site's cms collection of companies, which framer serves as a binary
// file of its own, read here. a company has its name, a line about it, its
// site, an industry and a stage — the two as choices from lists, which the
// page's filters spell out, "Acquired" among the stages being the fund's
// way out, with the buyer named in the line about the company. the files'
// places change with each publish, so the page is read for the modules it
// loads, and those for the collection's files, each run.

// the collection, and its fields, by the ids framer gives them
const COMPANIES = 'PZZTPYwRk';
const NAME = 'm8JTBRmZh';
const SLUG = 'zMkSHzchm';
const ABOUT = 'W_7ROKV6N';
const SITE = 'v8cgpPOOz';
const LINK = 'v_8AtgiMJ';
const INDUSTRY = 'ExfF4Da5o';
const STAGE = 'l59WAqE6X';

// the companies stored under the names the old site gave them, which the
// new one has changed: a moved name would read as a newcomer
const STORED_AS: Record<string, string> = {
	Revive: 'Hemster',
	'Stream Club': 'Stream'
};

const MODULE = /https:\/\/framerusercontent\.com\/sites\/[\w-]+\/[^"'\s)]+\.mjs/g;
// framer's own libraries and the site script, which name no collection files
const LIBRARY = /\/(?:react|motion|framer|shared-lib|rolldown-runtime|script_main)\.[\w-]+\.mjs$/;
const CHUNK = /new URL\(`\.\/(([\w-]+?)-chunk-default-\d+\.framercms)`,`(https:\/\/framerusercontent\.com\/modules\/[^`]+)`\)/g;
// a choice of the filters: its id and what it is called
const OPTION = /<option value="([\w-]+)"[^>]*>([^<]*)<\/option>/g;
// the choices that say nothing
const UNSAID = /^(?:unknown|uncategori[sz]ed)$/i;
const ACQUIRED = /^acquired$/i;
// "...; acquired by Coinbase in 2021." -> "Coinbase"
const BUYER = /\bacquired by ([^;.,]+?)(?: in \d{4})?(?=[;.,]|$)/i;
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

type Value = string | number | boolean | null | Value[] | { [key: string]: Value };

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

// a chunk of a collection: a count of items, then for each a count of
// fields, each its name, a byte for its kind and its value
function decode(buffer: ArrayBuffer): Map<string, Value>[] {
	const view = new DataView(buffer);
	const bytes = new Uint8Array(buffer);
	const utf8 = new TextDecoder();
	let at = 0;
	const count = (size: 2 | 4) => {
		const n = size === 2 ? view.getUint16(at) : view.getUint32(at);
		at += size;
		return n;
	};
	const text = () => {
		const length = count(4);
		const value = utf8.decode(bytes.subarray(at, at + length));
		at += length;
		return value;
	};
	const value = (): Value => {
		const kind = bytes[at++];
		switch (kind) {
			case 0:
				return null;
			// an array, each value with a kind of its own: references to
			// another collection's items are their ids
			case 1:
				return Array.from({ length: count(2) }, () => value());
			case 2:
				return bytes[at++] !== 0;
			// colour, enum, file, string
			case 3:
			case 5:
			case 6:
			case 12:
				return text();
			// link and image, held as json: a link to another site is its
			// address, one to a page of the site an object
			case 7:
			case 10: {
				const json = text();
				try {
					return JSON.parse(json) as Value;
				} catch {
					return null;
				}
			}
			// a date, in milliseconds, and a number
			case 4: {
				const ms = Number(view.getBigInt64(at));
				at += 8;
				return ms;
			}
			case 8: {
				const n = view.getFloat64(at);
				at += 8;
				return n;
			}
			case 9: {
				const object: { [key: string]: Value } = {};
				for (let n = count(2); n > 0; n--) {
					const key = text();
					object[key] = value();
				}
				return object;
			}
			// rich text, held inline or pointed at in a file of its own
			case 11: {
				const inline = bytes[at++];
				if (inline === 1) return text();
				if (inline !== 0) throw new Error(`charge: rich text of an unknown form (${inline}) in the cms data`);
				at += 4;
				return null;
			}
			case 13:
				return count(4);
		}
		throw new Error(`charge: a field of an unknown kind (${kind}) in the cms data`);
	};
	const items: Map<string, Value>[] = [];
	for (let i = count(4); i > 0; i--) {
		const fields = new Map<string, Value>();
		for (let f = count(2); f > 0; f--) {
			const name = text();
			fields.set(name, value());
		}
		items.push(fields);
	}
	return items;
}

const textOf = (value: Value | undefined) => (typeof value === 'string' ? clean(value) : '');

// rich text is held as json, a tree of nodes whose leaves are its words:
// [1, [4, "p", {...}, [5, "the words"]]]
function wordsOf(json: string): string {
	const words = (node: Value): string =>
		Array.isArray(node) ? (node[0] === 5 ? String(node[1] ?? '') : node.slice(1).map(words).join('')) : '';
	try {
		return clean(words(JSON.parse(json) as Value));
	} catch {
		return '';
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const page = await fetchText(PAGE_URL);
	const modules = [...new Set(page.match(MODULE) ?? [])].filter((url) => !LIBRARY.test(url));
	if (modules.length === 0) {
		throw new Error('charge: no framer modules on the portfolio page');
	}
	// what the industries and the stages are called, from the filters
	const called = new Map([...page.matchAll(OPTION)].map(([, id, label]) => [id, tag(label)]));
	if (called.size === 0) {
		throw new Error('charge: no filters on the portfolio page');
	}

	// the collection's files, from the modules that load them
	const chunks = new Set<string>();
	for (const source of await Promise.all(modules.map(fetchText))) {
		for (const [, file, id, from] of source.matchAll(CHUNK)) {
			if (id === COMPANIES) chunks.add(new URL(file, from).href.replace('/modules/', '/cms/'));
		}
	}
	if (chunks.size === 0) {
		throw new Error("charge: the page's modules name no files for the companies collection");
	}
	const items: Map<string, Value>[] = [];
	for (const chunk of chunks) {
		const resp = await fetch(chunk, { headers: { 'User-Agent': UA } });
		if (!resp.ok) {
			throw new Error(`Failed to fetch ${chunk}: ${resp.status}`);
		}
		items.push(...decode(await resp.arrayBuffer()));
	}
	// were the fields to move, the industries and the exits would go quietly
	if (!items.some((item) => called.has(textOf(item.get(STAGE))))) {
		throw new Error('charge: no company has a stage the filters know in the cms data');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of items) {
		const written = textOf(item.get(NAME));
		if (!written) {
			throw new Error('charge: a company has no name in the cms data');
		}
		const name = STORED_AS[written] ?? written;
		if (STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const industry = called.get(textOf(item.get(INDUSTRY))) ?? '';
		const stage = called.get(textOf(item.get(STAGE))) ?? '';
		const out = ACQUIRED.test(stage);
		const buyer = out ? (wordsOf(textOf(item.get(ABOUT))).match(BUYER)?.[1] ?? '') : '';
		const link = textOf(item.get(LINK));
		const site = textOf(item.get(SITE));
		const slug = textOf(item.get(SLUG));
		companies.push({
			name,
			category: [
				UNSAID.test(industry) ? '' : industry,
				out || UNSAID.test(stage) ? '' : stage,
				out ? (buyer ? `Acquired by ${tag(buyer)}` : 'Acquired') : '',
				out ? 'Exited' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: /^https?:\/\//i.test(link)
				? link
				: /^[\w-]+(?:\.[\w-]+)+(?:\/\S*)?$/.test(site)
					? `https://${site}`
					: slug
						? `${PAGE_URL}/${slug}`
						: PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('charge: no companies in the cms data');
	}

	return companies;
}
