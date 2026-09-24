import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://foundationcapital.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// framer: the page renders nine companies and loads the rest behind "Load
// More". the collection behind them ships as a binary .framercms chunk whose
// address — and the field ids to read out of it — are described by one of the
// site's own chunks, both hashed per publish and so read fresh each run, as
// for underline and watertower. a company's stage is kept unless it is
// "Active": an acquisition or an IPO is an exit, an ICO only the word.

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
	const schema = sources.find((s) => /title:[`"']Website URL[`"']/.test(s));
	if (!schema) {
		throw new Error('foundationcapital: no site chunk describes the portfolio collection');
	}

	const fieldId = (title: string) =>
		schema.match(new RegExp(`(\\w+):\\{[^{}]*?title:[\`"']${title}[\`"']`))?.[1];
	const nameField = fieldId('Title');
	const siteField = fieldId('Website URL');
	const stageField = fieldId('Stage');
	const dateField = fieldId('Investment Date');
	if (!nameField || !siteField) {
		throw new Error('foundationcapital: the collection schema no longer matches');
	}

	const chunk = schema.match(
		/new URL\([`"']\.\/([\w-]+-chunk-[\w-]+\.framercms)[`"'],[`"'](https:\/\/framerusercontent\.com\/modules\/[^`"']+\.js)[`"']\)/
	);
	if (!chunk) {
		throw new Error('foundationcapital: the collection lists no data chunk');
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
	const stages = read(stageField);
	// the stage is an enum, stored as an option id the schema spells out:
	// "Active", "Acquired", "IPO" or "ICO"
	const options = schema.match(
		/title:[`"']Stage[`"']|options:\[([^\]]*)\],optionTitles:\[([^\]]*)\],title:[`"']Stage[`"']/
	);
	const list = (s: string | undefined) => [...(s ?? '').matchAll(/[`"']([^`"']*)[`"']/g)].map((m) => m[1]);
	const stageNames = new Map(list(options?.[1]).map((id, i) => [id, list(options?.[2])[i] ?? '']));
	const dates = read(dateField);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (let i = 0; i < names.length; i++) {
		const from = names[i].at;
		const to = names[i + 1]?.at ?? Infinity;
		const between = (list: { at: number; value: string }[]) =>
			list.find((v) => v.at > from && v.at < to)?.value ?? '';

		const name = names[i].value.trim();
		if (!name || /^stealth\b/i.test(name) || seen.has(name)) continue;
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
			category: (() => {
				const stage = stageNames.get(between(stages).replace(/"/g, '')) ?? '';
				const year = between(dates).match(/\b(?:19|20)\d{2}\b/)?.[0];
				return [
					year ? `Invested ${year}` : '',
					/^active$/i.test(stage) ? '' : stage,
					/^(acquired|ipo)$/i.test(stage) ? 'Exited' : ''
				]
					.filter(Boolean)
					.join(', ');
			})(),
			url
		});
	}

	if (companies.length === 0) {
		throw new Error('foundationcapital: no companies in the collection data');
	}

	return companies;
}
