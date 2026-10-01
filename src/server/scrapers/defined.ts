import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://definedvc.com/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// framer: the companies page draws its first four cards and loads the rest
// as the visitor scrolls, from the site's cms collection of companies,
// which framer serves as a binary file of its own, read here. a card names
// the company over its theses ("Physical AI", "Agent Economy"), kept as
// tags, and its stage, as the filter calls it, "Active", "Exited" or
// "Previous Investment", the last kept as a tag; the theses and the stages
// are collections of their own, the companies pointing at them by id. an
// exit carries a note on how it went, "Acquired by Infineon", or a
// listing, "IPO: NYSE: QBTS", kept as "IPO (NYSE: QBTS)"; a note on a
// company still active ("Via acquisition of Nexera Robotics") is left out.
// the grid holds the companies with a picture for their card, which leaves
// out a "Manifesto card" kept in the same collection. the files' places
// change with each publish, so the page is read for the modules it loads,
// and those for the collections' files, each run.

// the collections, and their fields, by the ids framer gives them
const COMPANIES = 'TO2058qj4';
const THESES = 'SjZzoP_Mt';
const STAGES = 'qifycJQUV';
const NAME = 'JhMFoLCBc';
const WEBSITE = 'wLk8y6_st';
const NOTE = 'SDExWhNzo';
const PICTURE = 'JRojOeYr7';
const COMPANY_THESES = 'gSh2FSiS4';
const COMPANY_STAGES = 'bvDJA_r4y';
const THESIS_NAME = 'ENS_Lir_n';
const STAGE_NAME = 'NOSGaYopl';

const MODULE = /https:\/\/framerusercontent\.com\/sites\/[\w-]+\/[^"'\s)]+\.mjs/g;
// framer's own libraries and the site script, which name no collection files
const LIBRARY = /\/(?:react|motion|framer|shared-lib|rolldown-runtime|script_main)\.[\w-]+\.mjs$/;
const CHUNK = /new URL\(`\.\/(([\w-]+?)-chunk-default-\d+\.framercms)`,`(https:\/\/framerusercontent\.com\/modules\/[^`]+)`\)/g;
const EXITED = /^exited$/i;
const ACTIVE = /^active$/i;
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
				if (inline !== 0) throw new Error(`defined: rich text of an unknown form (${inline}) in the cms data`);
				at += 4;
				return null;
			}
			case 13:
				return count(4);
		}
		throw new Error(`defined: a field of an unknown kind (${kind}) in the cms data`);
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
const idsOf = (value: Value | undefined) =>
	Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];

// "IPO: NYSE: QBTS" -> "IPO (NYSE: QBTS)", "Acq by GE" -> "Acquired by GE"
function outcome(note: string): string {
	const said = tag(note);
	const listing = said.match(/^IPO\b\s*[:-]?\s*(.*)$/i);
	if (listing) return listing[1] ? `IPO (${listing[1]})` : 'IPO';
	return said.replace(/^acq(?:uired|\.)?\s+by\b/i, 'Acquired by');
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const page = await fetchText(PAGE_URL);
	const modules = [...new Set(page.match(MODULE) ?? [])].filter((url) => !LIBRARY.test(url));
	if (modules.length === 0) {
		throw new Error('defined: no framer modules on the companies page');
	}

	// each collection's files, from the modules that load them
	const files = new Map<string, Set<string>>();
	for (const source of await Promise.all(modules.map(fetchText))) {
		for (const [, file, id, from] of source.matchAll(CHUNK)) {
			if (!files.has(id)) files.set(id, new Set());
			files.get(id)!.add(new URL(file, from).href.replace('/modules/', '/cms/'));
		}
	}
	const collection = async (id: string) => {
		const chunks = [...(files.get(id) ?? [])];
		if (chunks.length === 0) {
			throw new Error(`defined: the page's modules name no files for the collection ${id}`);
		}
		const items: Map<string, Value>[] = [];
		for (const chunk of chunks) {
			const resp = await fetch(chunk, { headers: { 'User-Agent': UA } });
			if (!resp.ok) {
				throw new Error(`Failed to fetch ${chunk}: ${resp.status}`);
			}
			items.push(...decode(await resp.arrayBuffer()));
		}
		return items;
	};
	const [companyItems, thesisItems, stageItems] = await Promise.all([
		collection(COMPANIES),
		collection(THESES),
		collection(STAGES)
	]);

	// the theses and stages, by id
	const named = (items: Map<string, Value>[], field: string, what: string) => {
		const names = new Map(items.map((item) => [textOf(item.get('id')), textOf(item.get(field))]));
		if (![...names.values()].some(Boolean)) {
			throw new Error(`defined: the ${what} have no names in the cms data`);
		}
		return names;
	};
	const theses = named(thesisItems, THESIS_NAME, 'theses');
	const stages = named(stageItems, STAGE_NAME, 'stages');

	// the companies on the grid; were the fields pointing at their theses
	// and stages to move, the exits would go quietly
	const grid = companyItems.filter((item) => textOf(item.get(PICTURE)));
	for (const [field, what] of [
		[COMPANY_THESES, 'theses'],
		[COMPANY_STAGES, 'stages']
	]) {
		if (!grid.some((item) => idsOf(item.get(field)).length > 0)) {
			throw new Error(`defined: no company points at its ${what} in the cms data`);
		}
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of grid) {
		const name = textOf(item.get(NAME));
		if (!name) {
			throw new Error('defined: a company on the grid has no name in the cms data');
		}
		if (STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const thesisNames = idsOf(item.get(COMPANY_THESES)).map((id) => theses.get(id) ?? '');
		const stageNames = idsOf(item.get(COMPANY_STAGES)).map((id) => stages.get(id) ?? '');
		const out = [...thesisNames, ...stageNames].some((t) => EXITED.test(t));
		const note = textOf(item.get(NOTE));
		const went = out && note ? outcome(note) : '';
		const site = textOf(item.get(WEBSITE));
		companies.push({
			name,
			category: [
				...thesisNames.filter((t) => !EXITED.test(t)).map(tag),
				...stageNames.filter((t) => !EXITED.test(t) && !ACTIVE.test(t)).map(tag),
				went,
				out ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site)
				? site
				: /^[\w-]+(?:\.[\w-]+)+(?:\/\S*)?$/.test(site)
					? `https://${site}`
					: PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('defined: no companies in the cms data');
	}

	return companies;
}
