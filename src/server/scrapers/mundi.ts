import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.mundiventures.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// framer: the portfolio page is a list of the fund's companies drawn from
// its cms, nine shown and the rest behind "Load more", the whole of it a
// collection the page's scripts load as binary chunks. the scripts that
// define the collections are read from the page, the collections' chunks
// from them, and the chunks decoded — a company each with its name, its
// sectors ("Insur Tech", "Deep Tech"), the funds it sits in ("Alma Mundi",
// "Insurtech Mundi"), its city and country, its stage ("Early Stage") and
// its status ("Active", "Exited", "We tried"), with its site and, for an
// exit, its buyer ("KKR (NYSE)"). the sectors, the funds, the place and the
// stage are kept as tags, a sale with its buyer and the Exited tag, one the
// fund "tried" with the Closed tag.

// the scripts that define the site's collections: "HsIuoNbg9.ChSFrjyJ.mjs"
const MODULE = /https:\/\/framerusercontent\.com\/sites\/[\w-]+\/[A-Za-z0-9_]{9}\.[\w-]{8}\.mjs/g;
// a collection's chunk: new URL(`./HsIuoNbg9-chunk-default-0.framercms`,`https://…/HsIuoNbg9.js`)
const CHUNK = /new URL\(`\.\/((\w+)-chunk-[\w-]+\.framercms)`,`(https:\/\/framerusercontent\.com\/modules\/[^`]+)`\)/g;
// a field of a collection's schema: PFsoQB3Hp:{defaultValue:``,title:`Company name`,type:x.String}
const FIELD = /(\w+):\{([^{}]*?)title:`([^`]*)`,type:\w+\.(\w+)\}/g;
const OPTIONS = /\boptions:\[([^\]]*)\]/;
const OPTION_TITLES = /\boptionTitles:\[([^\]]*)\]/;
const REFERENCE = /dataIdentifier:`local-module:collection\/(\w+):default`/;
// a collection's "Previous" field, which points back at the collection itself
const PREVIOUS = /previousItemId:\{dataIdentifier:`local-module:collection\/(\w+):default`/;
const NAME_FIELD = 'Company name';
const EXITED = /^exited$/i;
const TRIED = /^we tried$/i;
const UNSAID = /^(?:-|other|others|all|n\/a|active)$/i;
const STEALTH = /^stealth\b/i;

interface Field {
	title: string;
	type: string;
	options: Map<string, string>;
	reference?: string;
}

type Value = string | number | boolean | Value[];
type Item = Record<string, Value>;

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const listOf = (s: string) => [...s.matchAll(/`([^`]*)`/g)].map(([, v]) => v);

async function get(url: string): Promise<Response> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp;
}

// a chunk of a collection as framer writes it: a count of items, then each
// item a count of fields and each field its key, a type byte and its value
function decode(bytes: ArrayBuffer): Item[] {
	const view = new DataView(bytes);
	const text = new TextDecoder();
	let at = 0;
	const u8 = () => view.getUint8(at++);
	const u16 = () => ((at += 2), view.getUint16(at - 2));
	const u32 = () => ((at += 4), view.getUint32(at - 4));
	const str = () => {
		const length = u32();
		at += length;
		return text.decode(new Uint8Array(bytes, at - length, length));
	};
	const value = (type: number): Value => {
		switch (type) {
			case 0x01: {
				const length = u16();
				return Array.from({ length }, () => value(u8()));
			}
			case 0x02:
				return u8() !== 0;
			case 0x04:
			case 0x08:
				at += 8;
				return view.getFloat64(at - 8);
			// a string, an enum's key, a link and an image all come as text
			case 0x05:
			case 0x07:
			case 0x0a:
			case 0x0c:
				return str();
			default:
				throw new Error(`mundi: a cms chunk holds a value of unknown type ${type} — the format moved`);
		}
	};
	const items: Item[] = [];
	for (let count = u32(); items.length < count; ) {
		const item: Item = {};
		for (let fields = u16(); fields > 0; fields--) {
			const key = str();
			item[key] = value(u8());
		}
		items.push(item);
	}
	return items;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await (await get(PAGE_URL)).text();
	const modules = [...new Set(html.match(MODULE) ?? [])];

	// every collection's fields and chunks, from the scripts that define them
	const fields = new Map<string, Field>();
	const chunks = new Map<string, string[]>();
	let portfolio = '';
	for (const url of modules) {
		const code = await (await get(url)).text();
		for (const [, key, body, title, type] of code.matchAll(FIELD)) {
			const options = listOf(body.match(OPTIONS)?.[1] ?? '');
			const titles = listOf(body.match(OPTION_TITLES)?.[1] ?? '');
			fields.set(key, {
				title,
				type,
				options: new Map(options.map((option, i) => [option, titles[i] ?? ''])),
				reference: body.match(REFERENCE)?.[1]
			});
		}
		for (const [, file, collection, base] of code.matchAll(CHUNK)) {
			const href = new URL(`./${file}`, base).href.replace('/modules/', '/cms/');
			chunks.set(collection, [...new Set([...(chunks.get(collection) ?? []), href])]);
		}
		// the portfolio is the collection whose schema names a company; its own
		// id is the one its "Previous" field points back to
		const at = code.indexOf(`title:\`${NAME_FIELD}\``);
		if (at >= 0 && !portfolio) {
			portfolio = code.slice(at).match(PREVIOUS)?.[1] ?? '';
		}
	}
	if (!portfolio || !chunks.has(portfolio)) {
		throw new Error("mundi: the page's scripts define no portfolio collection — the site moved");
	}

	const itemsOf = async (collection: string): Promise<Item[]> => {
		const items: Item[] = [];
		for (const href of chunks.get(collection) ?? []) {
			items.push(...decode(await (await get(href)).arrayBuffer()));
		}
		return items;
	};
	const companies: Item[] = await itemsOf(portfolio);
	const keyOf = (title: string) =>
		Object.keys(companies[0] ?? {}).find((key) => fields.get(key)?.title === title) ?? '';

	// the titles of the items the companies refer to — sectors, funds, cities
	const titles = new Map<string, string>();
	const referenced = new Set(
		Object.keys(companies[0] ?? {})
			.map((key) => fields.get(key)?.reference)
			.filter((id): id is string => !!id && id !== portfolio)
	);
	for (const collection of referenced) {
		for (const item of await itemsOf(collection)) {
			const title = Object.keys(item).find((key) => fields.get(key)?.title === 'Title');
			if (title) titles.set(String(item.id), clean(String(item[title])));
		}
	}

	const text = (item: Item, title: string) => clean(String(item[keyOf(title)] ?? ''));
	const option = (item: Item, title: string) =>
		clean(fields.get(keyOf(title))?.options.get(String(item[keyOf(title)] ?? '')) ?? '');
	const refs = (item: Item, title: string) => {
		const value = item[keyOf(title)];
		return (Array.isArray(value) ? value : []).map((id) => titles.get(String(id)) ?? '');
	};

	const results: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of companies) {
		const name = text(item, NAME_FIELD);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const status = option(item, 'STATUS');
		const buyer = text(item, 'Acquired by');
		let site = '';
		try {
			site = clean(JSON.parse(String(item[keyOf('Website Link')] ?? '""')));
		} catch {
			site = '';
		}
		results.push({
			name,
			category: [
				...refs(item, 'Sector').map(tag),
				...refs(item, 'FUND').map(tag),
				...refs(item, 'Cities').map(tag),
				tag(option(item, 'Country')),
				tag(option(item, 'STAGE')),
				EXITED.test(status) && buyer ? `Acquired by ${tag(buyer)}` : '',
				EXITED.test(status) ? 'Exited' : TRIED.test(status) ? 'Closed' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}

	if (results.length === 0) {
		throw new Error("mundi: the portfolio collection names no companies — the cms moved");
	}

	return results;
}
