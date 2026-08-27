import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.xfund.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// the page is a Framer site that server-renders only the first dozen cards;
// the rest stream in on scroll from the "Portfolio Cards" CMS collection. the
// scraper walks the same trail the browser does — page HTML → site chunks →
// the collection's schema module (which names the fields and the category
// labels) — and then downloads the collection's data chunks whole instead of
// in scroll-sized ranges. every url on that trail is re-derived per scrape,
// because Framer rehashes them on each publish.

const fetchText = async (url: string): Promise<string> => {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	return resp.text();
};

// the .framercms chunk is length-prefixed binary: a field appears as
// u32-be(9) + the field id, then one type byte, u32-be length, and the value
// bytes. collect every value of one field, with its byte offset
function fieldValues(bytes: Uint8Array, fieldId: string): { at: number; value: string }[] {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const decoder = new TextDecoder();
	const marker = new Uint8Array(4 + fieldId.length);
	new DataView(marker.buffer).setUint32(0, fieldId.length);
	marker.set(new TextEncoder().encode(fieldId), 4);

	const found: { at: number; value: string }[] = [];
	outer: for (let i = 0; i <= bytes.length - marker.length; i++) {
		for (let j = 0; j < marker.length; j++) if (bytes[i + j] !== marker[j]) continue outer;
		const start = i + marker.length + 1; // skip the type byte
		const length = view.getUint32(start);
		found.push({ at: i, value: decoder.decode(bytes.subarray(start + 4, start + 4 + length)) });
	}
	return found;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await fetchText(PAGE_URL);

	// the collection's schema module is referenced from one of the site chunks
	const chunkUrls = [
		...new Set(
			[...html.matchAll(/https:\/\/framerusercontent\.com\/sites\/[^"']+\.mjs/g)].map((m) => m[0])
		)
	];
	const sources = await Promise.all(chunkUrls.map(fetchText));
	const moduleUrls = [
		...new Set(
			sources.flatMap((s) => [
				...s.matchAll(/https:\/\/framerusercontent\.com\/modules\/[^"'`]+?\.js/g)
			]).map((m) => m[0])
		)
	];
	if (moduleUrls.length === 0) {
		throw new Error('xfund: no CMS module references in the site chunks');
	}

	const modules = await Promise.all(moduleUrls.map(fetchText));
	const at = modules.findIndex(
		(m) => /title:[`"']Website[`"']/.test(m) && /title:[`"']Category[`"']/.test(m)
	);
	if (at < 0) {
		throw new Error('xfund: no module describes a collection with Website and Category fields');
	}
	const schema = modules[at];

	const nameField = schema.match(/(\w+):\{[^{}]*?title:[`"']Title[`"'],type:\w\.String\}/)?.[1];
	const siteField = schema.match(/(\w+):\{[^{}]*?title:[`"']Website[`"'],type:\w\.Link\}/)?.[1];
	const categoryField = schema.match(
		/(\w+):\{[^{}]*?options:\[([^\]]*)\],optionTitles:\[([^\]]*)\],title:[`"']Category[`"']/
	);
	if (!nameField || !siteField || !categoryField) {
		throw new Error('xfund: the collection schema no longer matches');
	}
	const unquote = (list: string) =>
		[...list.matchAll(/[`"']([^`"']*)[`"']/g)].map((m) => m[1]);
	const options = unquote(categoryField[2]);
	const categories = new Map(options.map((id, i) => [id, unquote(categoryField[3])[i] ?? '']));

	// data chunks sit next to the module, under /cms/ instead of /modules/
	const base = moduleUrls[at].replace('/modules/', '/cms/');
	const dataFiles = [...new Set([...schema.matchAll(/[`"']\.\/(\w+-chunk-\w+-\d+\.framercms)[`"']/g)].map((m) => m[1]))];
	if (dataFiles.length === 0) {
		throw new Error('xfund: the collection module lists no data chunks');
	}

	const companies: ScrapedCompany[] = [];
	for (const file of dataFiles) {
		const resp = await fetch(new URL(file, base), { headers: { 'User-Agent': UA } });
		if (!resp.ok) throw new Error(`Failed to fetch ${file}: ${resp.status}`);
		const bytes = new Uint8Array(await resp.arrayBuffer());

		// one name per company; its website and category are the field values
		// that follow it, before the next company's name
		const names = fieldValues(bytes, nameField);
		const sites = fieldValues(bytes, siteField);
		const cats = fieldValues(bytes, categoryField[1]);
		for (let i = 0; i < names.length; i++) {
			const from = names[i].at;
			const to = names[i + 1]?.at ?? Infinity;
			const between = <T extends { at: number }>(list: T[]) =>
				list.find((v) => v.at > from && v.at < to);
			const name = names[i].value.trim();
			if (!name) continue;
			// the Link field holds a JSON string for external urls — sometimes
			// without a scheme, which the site's runtime quietly adds; internal
			// page references are anything else and carry no company site
			let url = '';
			const rawSite = between(sites)?.value ?? '';
			if (rawSite.startsWith('"')) {
				const parsed = JSON.parse(rawSite) as string;
				if (parsed.startsWith('http')) url = parsed;
				else if (/^[\w-]+(\.[\w-]+)+/.test(parsed)) url = `https://${parsed}`;
			}
			companies.push({
				name,
				category: categories.get(between(cats)?.value ?? '') ?? '',
				url
			});
		}
	}

	if (companies.length === 0) {
		throw new Error('xfund: no companies found in the collection data');
	}

	return companies;
}
