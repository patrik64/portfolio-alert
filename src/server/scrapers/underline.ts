import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://underline.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// framer: the page lays every company out more than once for its breakpoints,
// so the cards are not worth counting. the collection behind them is, and it
// ships as a binary .framercms chunk whose address — and the field ids to read
// out of it — are described by one of the site's own chunks. both are hashed
// per publish and so are read fresh each run, as for watertower.
//
// three entries are investments the fund has not named: their type reads "TBA"
// and their title is the sector they are in rather than a company.

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

// every value stored for one field, with the offset it sits at — a record is
// the run of values between one Title and the next
function fieldValues(bytes: Uint8Array, view: DataView, fieldId: string) {
	const decoder = new TextDecoder();
	const marker = new Uint8Array(4 + fieldId.length);
	new DataView(marker.buffer).setUint32(0, fieldId.length);
	marker.set(new TextEncoder().encode(fieldId), 4);

	const found: { at: number; value: string }[] = [];
	outer: for (let i = 0; i <= bytes.length - marker.length; i++) {
		for (let j = 0; j < marker.length; j++) if (bytes[i + j] !== marker[j]) continue outer;
		const start = i + marker.length + 1; // past the type byte
		// the last field of the last record can sit right at the end of the
		// chunk, so a length that would run past it is not one
		if (start + 4 > bytes.length) continue;
		const length = view.getUint32(start);
		if (start + 4 + length > bytes.length) continue;
		found.push({ at: i, value: decoder.decode(bytes.subarray(start + 4, start + 4 + length)) });
	}
	return found;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await fetchText(PAGE_URL);
	const chunkUrls = [
		...new Set(
			[...html.matchAll(/https:\/\/framerusercontent\.com\/sites\/[^"']+\.mjs/g)].map((m) => m[0])
		)
	];
	const sources = await Promise.all(chunkUrls.map(fetchText));
	const schema = sources.find((s) => /title:[`"']project_cta_url[`"']/.test(s));
	if (!schema) {
		throw new Error('underline: no site chunk describes the portfolio collection');
	}

	const fieldId = (title: string) =>
		schema.match(new RegExp(`(\\w+):\\{[^{}]*?title:[\`"']${title}[\`"']`))?.[1];
	const nameField = fieldId('Title');
	const siteField = fieldId('project_cta_url');
	const sectorField = fieldId('project_sector');
	const countryField = fieldId('project_country');
	const typeField = fieldId('project_type');
	if (!nameField || !siteField || !typeField) {
		throw new Error('underline: the collection schema no longer matches');
	}

	const chunk = schema.match(
		/new URL\([`"']\.\/([\w-]+-chunk-[\w-]+\.framercms)[`"'],[`"'](https:\/\/framerusercontent\.com\/modules\/[^`"']+\.js)[`"']\)/
	);
	if (!chunk) {
		throw new Error('underline: the collection lists no data chunk');
	}
	const dataUrl = new URL(chunk[1], chunk[2].replace('/modules/', '/cms/'));

	const resp = await fetch(dataUrl, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${dataUrl}: ${resp.status}`);
	}
	const bytes = new Uint8Array(await resp.arrayBuffer());
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const read = (id: string | undefined) => (id ? fieldValues(bytes, view, id) : []);

	const names = read(nameField);
	const sites = read(siteField);
	const sectors = read(sectorField);
	const countries = read(countryField);
	const types = read(typeField);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (let i = 0; i < names.length; i++) {
		const from = names[i].at;
		const to = names[i + 1]?.at ?? Infinity;
		const between = (list: { at: number; value: string }[]) =>
			list.find((v) => v.at > from && v.at < to)?.value ?? '';

		const name = names[i].value.trim();
		if (!name || /^tba$/i.test(between(types)) || seen.has(name)) continue;
		seen.add(name);

		// the Link field holds a json string
		let url = '';
		const rawSite = between(sites);
		if (rawSite.startsWith('"')) {
			const parsed = JSON.parse(rawSite) as string;
			if (parsed.startsWith('http')) url = parsed;
			else if (/^[\w-]+(\.[\w-]+)+/.test(parsed)) url = `https://${parsed}`;
		}

		companies.push({
			name,
			category: [between(sectors).trim(), between(countries).trim()].filter(Boolean).join(', '),
			url
		});
	}

	if (companies.length === 0) {
		throw new Error('underline: no companies in the collection data');
	}

	return companies;
}
