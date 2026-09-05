import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://20vc.fund/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// framer: the portfolio is a binary .framercms collection, read the way
// watertower's is — the site chunk describes the fields and says where the
// data sits, and both are hashed per publish.
//
// the sector is stored as an id rather than a word, and the same chunk lists
// what those ids stand for. whether a company has exited is a flag, which is
// a type byte and one byte more rather than a length and a string.

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

// every place one field is stored, with the offset it sits at
function fieldMarks(bytes: Uint8Array, fieldId: string): { at: number; body: number }[] {
	const marker = new Uint8Array(4 + fieldId.length);
	new DataView(marker.buffer).setUint32(0, fieldId.length);
	marker.set(new TextEncoder().encode(fieldId), 4);

	const found: { at: number; body: number }[] = [];
	outer: for (let i = 0; i <= bytes.length - marker.length; i++) {
		for (let j = 0; j < marker.length; j++) if (bytes[i + j] !== marker[j]) continue outer;
		found.push({ at: i, body: i + marker.length });
	}
	return found;
}

// a string is a type byte, a length and the bytes; the last field of the last
// record can sit right at the end, so a length that runs past it is not one
const strings = (bytes: Uint8Array, view: DataView, decoder: TextDecoder, fieldId: string) =>
	fieldMarks(bytes, fieldId).flatMap(({ at, body }) => {
		if (body + 5 > bytes.length) return [];
		const length = view.getUint32(body + 1);
		if (body + 5 + length > bytes.length) return [];
		return [{ at, value: decoder.decode(bytes.subarray(body + 5, body + 5 + length)) }];
	});

const booleans = (bytes: Uint8Array, fieldId: string) =>
	fieldMarks(bytes, fieldId)
		.filter(({ body }) => body + 1 < bytes.length)
		.map(({ at, body }) => ({ at, value: bytes[body + 1] === 1 }));

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await fetchText(PAGE_URL);
	const chunkUrls = [
		...new Set(
			[...html.matchAll(/https:\/\/framerusercontent\.com\/sites\/[^"']+\.mjs/g)].map((m) => m[0])
		)
	];
	const sources = await Promise.all(chunkUrls.map(fetchText));
	const schema = sources.find((s) => /title:[`"']Companies[`"']/.test(s));
	if (!schema) {
		throw new Error('twentyvc: no site chunk describes the portfolio collection');
	}

	const fieldId = (title: string) =>
		schema.match(new RegExp(`(\\w+):\\{[^{}]*?title:[\`"']${title}[\`"']`))?.[1];
	const nameField = fieldId('Companies');
	const siteField = fieldId('URL');
	const exitField = fieldId('Exit Status');
	if (!nameField || !siteField) {
		throw new Error('twentyvc: the collection schema no longer matches');
	}

	// the sector enum keeps its ids and their titles side by side
	const enumeration = schema.match(
		/(\w+):\{[^{}]*?options:\[([^\]]*)\],optionTitles:\[([^\]]*)\],title:[`"']Sector[`"']/
	);
	const unquote = (list: string) => [...list.matchAll(/[`"']([^`"']*)[`"']/g)].map((m) => m[1]);
	const sectors = new Map<string, string>();
	if (enumeration) {
		const ids = unquote(enumeration[2]);
		const titles = unquote(enumeration[3]);
		ids.forEach((id, i) => sectors.set(id, titles[i] ?? ''));
	}

	const chunk = schema.match(
		/new URL\([`"']\.\/([\w-]+-chunk-[\w-]+\.framercms)[`"'],[`"'](https:\/\/framerusercontent\.com\/modules\/[^`"']+\.js)[`"']\)/
	);
	if (!chunk) {
		throw new Error('twentyvc: the collection lists no data chunk');
	}
	const dataUrl = new URL(chunk[1], chunk[2].replace('/modules/', '/cms/'));

	const resp = await fetch(dataUrl, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${dataUrl}: ${resp.status}`);
	}
	const bytes = new Uint8Array(await resp.arrayBuffer());
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const decoder = new TextDecoder();

	const names = strings(bytes, view, decoder, nameField);
	const sites = strings(bytes, view, decoder, siteField);
	const sectorIds = enumeration ? strings(bytes, view, decoder, enumeration[1]) : [];
	const exited = exitField ? booleans(bytes, exitField) : [];

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (let i = 0; i < names.length; i++) {
		const from = names[i].at;
		const to = names[i + 1]?.at ?? Infinity;
		const between = <T extends { at: number }>(list: T[]) =>
			list.find((v) => v.at > from && v.at < to);

		const name = names[i].value.trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);

		let url = '';
		const rawSite = between(sites)?.value ?? '';
		if (rawSite.startsWith('"')) {
			const parsed = JSON.parse(rawSite) as string;
			if (parsed.startsWith('http')) url = parsed;
			else if (/^[\w-]+(\.[\w-]+)+/.test(parsed)) url = `https://${parsed}`;
		}

		companies.push({
			name,
			category: [
				sectors.get(between(sectorIds)?.value ?? '') ?? '',
				between(exited)?.value ? 'Exited' : ''
			]
				.filter(Boolean)
				.join(', '),
			url
		});
	}

	if (companies.length === 0) {
		throw new Error('twentyvc: no companies in the collection data');
	}

	return companies;
}
