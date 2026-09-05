import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.monashees.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BATCH_SIZE = 6;

// framer, and the page is not the portfolio. it renders the first sixteen
// companies — the alphabet stops at Coderhouse — and the browser reads the
// rest out of the site's own cms, which framer publishes as a plain binary
// file beside the javascript that knows how to read it. a hundred and
// thirteen companies are in there.
//
// so the file is read instead of the page, and everything needed to find it
// comes from the site: the page names its modules, one of those names the
// collection modules, and a collection module carries both the address of its
// data and the schema saying which field is which. nothing here is written
// down but the shape of the file, which is a count of records, then per
// record a count of fields, then per field a name, a type and a value.
//
// the fund's own field names are kept as it typed them, misspellings and all —
// headquaters, inicial-investiment — so that fixing a typo does not silently
// drop a field. the round it came in at is the shape of the investment rather
// than the company and is left out; where the company works is kept.
//
// status is a reference into a second collection of three rows, so that one is
// read too and joined on the id. thirty-six of the hundred and thirteen have
// gone, as M&A or IPO, and the fund's own word for each is kept. Active is the
// state a company is in unless something has happened and is not written down.

const SITE_MODULE = /https:\/\/framerusercontent\.com\/sites\/[A-Za-z0-9]+\/[A-Za-z0-9._-]+\.mjs/g;
const COLLECTION_MODULE = /https:\/\/framerusercontent\.com\/modules\/[A-Za-z0-9]+\/[A-Za-z0-9]+\/([A-Za-z0-9]+)\.js/g;
const FIELD = /(\w+):\{([^{}]*)\}/g;
const TITLE = /title:"([^"]+)"/;
const REFERENCE = /local-module:collection\/(\w+):default/;
const CHUNK = /new URL\("\.\/([^"]+\.framercms)"/;
// the state a company is in unless the fund says otherwise
const DEFAULT_STATE = /^active$/i;
// what the fund's own field is called, however it spells the rest of it
const NAME = /^name$/i;
const LINK = /^link$/i;
const STATUS = /^status$/i;
const TAG = /^tag/i;
const WHERE = /^headqua/i;

// the types framer writes a value as: a length-prefixed string, an eight-byte
// number, or nothing at all
const STRING_TYPES = new Set([3, 7, 10, 12]);
const NUMBER_TYPE = 4;
const EMPTY_TYPE = 0;

interface Collection {
	id: string;
	url: string;
	fields: { id: string; title: string; reference?: string }[];
	chunk: string;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

async function inBatches<T, R>(items: T[], run: (item: T) => Promise<R>): Promise<R[]> {
	const done: R[] = [];
	for (let at = 0; at < items.length; at += BATCH_SIZE) {
		done.push(...(await Promise.all(items.slice(at, at + BATCH_SIZE).map(run))));
	}
	return done;
}

// a record is a count of fields, and a field is a name, a type and a value
function decode(bytes: ArrayBuffer): Record<string, string>[] {
	const view = new DataView(bytes);
	const text = new TextDecoder();
	let at = 0;
	const string = () => {
		const length = view.getUint32(at);
		at += 4;
		const read = text.decode(new Uint8Array(bytes, at, length));
		at += length;
		return read;
	};

	const records: Record<string, string>[] = [];
	const count = view.getUint32(at);
	at += 4;
	for (let index = 0; index < count; index++) {
		const fields = view.getUint16(at);
		at += 2;
		const record: Record<string, string> = {};
		for (let field = 0; field < fields; field++) {
			const name = string();
			const type = view.getUint8(at);
			at += 1;
			if (STRING_TYPES.has(type)) record[name] = string();
			else if (type === NUMBER_TYPE) at += 8;
			else if (type !== EMPTY_TYPE) {
				throw new Error(`monashees: the cms file holds a field of an unknown kind (${type})`);
			}
		}
		records.push(record);
	}
	if (at !== bytes.byteLength) {
		throw new Error('monashees: the cms file did not read to its end');
	}
	return records;
}

async function collectionsOf(page: string): Promise<Collection[]> {
	const modules = [...new Set(page.match(SITE_MODULE) ?? [])];
	if (modules.length === 0) {
		throw new Error('monashees: the page names no modules of its own');
	}
	const scripts = await inBatches(modules, fetchText);

	const found = new Map<string, string>();
	for (const script of scripts) {
		for (const [url, id] of script.matchAll(COLLECTION_MODULE)) found.set(id, url);
	}
	if (found.size === 0) {
		throw new Error('monashees: the site modules name no collections');
	}

	return inBatches([...found], async ([id, url]) => {
		const source = await fetchText(url);
		const fields = [...source.matchAll(FIELD)]
			.map(([, field, body]) => ({
				id: field,
				title: body.match(TITLE)?.[1] ?? '',
				reference: body.match(REFERENCE)?.[1]
			}))
			.filter((field) => field.title);
		const chunk = source.match(CHUNK)?.[1] ?? '';
		return {
			id,
			url,
			fields,
			// framer serves a collection's data beside the module that reads it
			chunk: chunk ? new URL(chunk, url).href.replace('/modules/', '/cms/') : ''
		};
	});
}

async function rowsOf(collection: Collection): Promise<Record<string, string>[]> {
	const resp = await fetch(collection.chunk, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${collection.chunk}: ${resp.status}`);
	}
	return decode(await resp.arrayBuffer());
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const collections = await collectionsOf(await fetchText(PAGE_URL));

	// the portfolio is the collection that names companies and links to them
	const portfolio = collections.find(
		(collection) =>
			collection.chunk &&
			collection.fields.some((field) => NAME.test(field.title)) &&
			collection.fields.some((field) => LINK.test(field.title))
	);
	if (!portfolio) {
		throw new Error('monashees: no collection of companies among the site modules');
	}
	const field = (matches: RegExp) =>
		portfolio.fields.filter((one) => matches.test(one.title)).map((one) => one.id);

	const states = new Map<string, string>();
	const status = portfolio.fields.find((one) => STATUS.test(one.title))?.reference;
	const named = collections.find((collection) => collection.id === status && collection.chunk);
	if (named) {
		const title = named.fields.find((one) => NAME.test(one.title))?.id;
		for (const row of await rowsOf(named)) {
			if (row.id && title && row[title]) states.set(row.id, clean(row[title]));
		}
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const row of await rowsOf(portfolio)) {
		const name = clean(row[field(NAME)[0] ?? ''] ?? '');
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		// the fund writes an address as a quoted string, and not always with a
		// scheme in front of it
		const link = clean(row[field(LINK)[0] ?? ''] ?? '').replace(/^"|"$/g, '');
		const state = states.get(clean(row[field(STATUS)[0] ?? ''] ?? '')) ?? '';

		companies.push({
			name,
			category: [
				...field(TAG).map((tag) => clean(row[tag] ?? '')),
				...field(WHERE).map((where) => clean(row[where] ?? '')),
				DEFAULT_STATE.test(state) ? '' : state
			]
				.filter(Boolean)
				.join(', '),
			url: link && !/^https?:\/\//i.test(link) ? `https://${link}` : link
		});
	}

	if (companies.length === 0) {
		throw new Error('monashees: no companies in the cms');
	}

	return companies;
}
