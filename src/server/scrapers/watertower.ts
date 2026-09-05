import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.watertowerventures.com/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// framer, whose cms the page fills in the browser — the served html names no
// company. the collection ships as a binary .framercms chunk, and the site
// chunk that reads it also describes the collection: the field ids, and the
// url the data sits at. both are rehashed on every publish, so both are read
// fresh here rather than hardcoded, as for xfund.
//
// a company's acquisition is its own boolean field, not its stage: five
// companies carry the flag while only two also read "Acquired" as their stage.

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

// every value stored for one field, with the offset it sits at — a record is
// the run of values between one Company value and the next
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

// a string is a type byte, a length and the bytes; a boolean is a type byte
// and one byte more
// the last field of the last record can sit right at the end of the chunk, so
// a length that would run past it is not one
const strings = (bytes: Uint8Array, view: DataView, decoder: TextDecoder, fieldId: string) =>
	fieldMarks(bytes, fieldId).flatMap(({ at, body }) => {
		if (body + 5 > bytes.length) return [];
		const length = view.getUint32(body + 1);
		if (body + 5 + length > bytes.length) return [];
		return [{ at, value: decoder.decode(bytes.subarray(body + 5, body + 5 + length)) }];
	});

const booleans = (bytes: Uint8Array, fieldId: string) =>
	fieldMarks(bytes, fieldId).map(({ at, body }) => ({ at, value: bytes[body + 1] === 1 }));

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await fetchText(PAGE_URL);

	const chunkUrls = [
		...new Set(
			[...html.matchAll(/https:\/\/framerusercontent\.com\/sites\/[^"']+\.mjs/g)].map((m) => m[0])
		)
	];
	const sources = await Promise.all(chunkUrls.map(fetchText));
	const schema = sources.find(
		(s) => /title:[`"']Company[`"']/.test(s) && /title:[`"']Website[`"']/.test(s)
	);
	if (!schema) {
		throw new Error('watertower: no site chunk describes the companies collection');
	}

	const fieldId = (title: string, type: string) =>
		schema.match(new RegExp(`(\\w+):\\{[^{}]*?title:[\`"']${title}[\`"'],type:\\w\\.${type}\\}`))?.[1];
	const nameField = fieldId('Company', 'String');
	const siteField = fieldId('Website', 'Link');
	const acquiredField = fieldId('Acquired', 'Boolean');
	const industryField = fieldId('Industry', 'String');
	const locationField = fieldId('Location', 'String');
	const stageField = fieldId('Stage', 'String');
	if (!nameField || !siteField || !acquiredField) {
		throw new Error('watertower: the collection schema no longer matches');
	}

	// the data chunk sits beside the collection's module, under /cms/
	const chunk = schema.match(
		/new URL\([`"']\.\/([\w-]+-chunk-[\w-]+\.framercms)[`"'],[`"'](https:\/\/framerusercontent\.com\/modules\/[^`"']+\.js)[`"']\)/
	);
	if (!chunk) {
		throw new Error('watertower: the collection lists no data chunk');
	}
	const dataUrl = new URL(chunk[1], chunk[2].replace('/modules/', '/cms/'));

	const resp = await fetch(dataUrl, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${dataUrl}: ${resp.status}`);
	}
	const bytes = new Uint8Array(await resp.arrayBuffer());
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const decoder = new TextDecoder();
	const read = (id: string | undefined) => (id ? strings(bytes, view, decoder, id) : []);

	const names = read(nameField);
	const sites = read(siteField);
	const industries = read(industryField);
	const locations = read(locationField);
	const stages = read(stageField);
	const acquired = booleans(bytes, acquiredField);

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

		// the Link field holds a json string; a scheme-less address is one the
		// site's own runtime completes
		let url = '';
		const rawSite = between(sites)?.value ?? '';
		if (rawSite.startsWith('"')) {
			const parsed = JSON.parse(rawSite) as string;
			if (parsed.startsWith('http')) url = parsed;
			else if (/^[\w-]+(\.[\w-]+)+/.test(parsed)) url = `https://${parsed}`;
		}

		const stage = (between(stages)?.value ?? '').trim();
		const tags = [
			(between(industries)?.value ?? '').trim(),
			(between(locations)?.value ?? '').trim(),
			// the flag below says it better, and says it for every company
			/^acquired$/i.test(stage) ? '' : stage,
			between(acquired)?.value ? 'Acquired' : ''
		].filter(Boolean);

		companies.push({ name, category: tags.join(', '), url });
	}

	if (companies.length === 0) {
		throw new Error('watertower: no companies in the collection data');
	}

	return companies;
}
