import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.fov.ventures';
const PAGE_URL = `${BASE_URL}/portfolio`;
const PER_PAGE = 100;
const MAX_PAGES = 20;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// softr: the portfolio page is a list block drawn in the browser from a
// softr table, the page carrying only the block's settings — which table
// it reads and which of the table's fields fills the card's heading (the
// company's name), its picture's tags (its sectors: "AI", "B2B") and its
// labelled tags ("Country", "Notable Co-Investors"). the table's records
// are asked of the site the way the page asks, a hundred at a time, until
// the count it gives is reached; a list short of that count fails the run.
// the sectors and the countries are kept as tags; the cards link no site,
// so every company links the page, and nothing marks an exit.

const APP = /data-appid="([^"]+)"/;
const PAGE = /data-pageId="([^"]+)"/i;
const BLOCKS = 'var softrBlocks = ';
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

interface Field {
	type?: string;
	mappedTo?: string;
}

interface Item {
	field?: Field;
	label?: { value?: string } | null;
}

interface Block {
	id?: string;
	name?: string;
	version?: string;
	type?: string;
	collection?: { dataSources?: { id?: string }[] };
	elements?: { fields?: { items?: Item[] } };
}

interface Records {
	total?: number;
	offset?: string | number | null;
	items?: { fields?: Record<string, unknown> }[];
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the json value opening at start — an object or an array — up to its close
function jsonAt(text: string, start: number): unknown {
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let i = start; i < text.length; i++) {
		const c = text[i];
		if (escaped) escaped = false;
		else if (c === '\\') escaped = true;
		else if (c === '"') inString = !inString;
		else if (!inString) {
			if (c === '{' || c === '[') depth++;
			else if ((c === '}' || c === ']') && --depth === 0) {
				try {
					return JSON.parse(text.slice(start, i + 1));
				} catch {
					return undefined;
				}
			}
		}
	}
	return undefined;
}

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// a field's value as text: a string, or the labels of a list of options
const texts = (value: unknown): string[] =>
	(Array.isArray(value) ? value : [value])
		.map((v) =>
			typeof v === 'string' ? v : v && typeof v === 'object' && 'label' in v ? String(v.label ?? '') : ''
		)
		.map(clean)
		.filter(Boolean);

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const app = html.match(APP)?.[1];
	const page = html.match(PAGE)?.[1];
	const at = html.indexOf(BLOCKS);
	const found = at < 0 ? undefined : jsonAt(html, at + BLOCKS.length);
	const blocks: Block[] = Array.isArray(found) ? found : [];
	const block = blocks.find((b) => b.type === 'dynamic' && b.name?.startsWith('list'));
	const source = block?.collection?.dataSources?.[0]?.id;
	if (!app || !page || !block?.id || !source) {
		throw new Error("fov: the portfolio page's list block moved — its table could not be found");
	}
	// which field fills which part of the card
	const items = block.elements?.fields?.items ?? [];
	const fieldOf = (type: string, label?: string) =>
		items.find((i) => i.field?.type === type && (!label || i.label?.value === label))?.field?.mappedTo ?? '';
	const nameField = fieldOf('heading');
	const sectorField = fieldOf('coverMediaTags');
	const countryField = fieldOf('tag', 'Country');
	if (!nameField) {
		throw new Error("fov: the list block's cards name no field for the company");
	}

	// the whole table, a hundred records at a time, up to the count it gives
	const url = `${BASE_URL}/v1/datasource/applications/${app}/pages/${page}/blocks/${block.id}/datasources/${source}/records`;
	const records: { fields?: Record<string, unknown> }[] = [];
	let total = 0;
	for (let offset: string | number | null = null, n = 0; n < MAX_PAGES; n++) {
		const answer: Response = await fetch(url, {
			method: 'POST',
			headers: {
				'User-Agent': UA,
				'Content-Type': 'application/json',
				...(block.name ? { 'X-Block-Name': block.name } : {}),
				...(block.version ? { 'X-Block-Version': block.version } : {})
			},
			body: JSON.stringify({
				options: { timeZone: 'UTC', userLocale: 'en-US' },
				pageContext: null,
				filterCriteria: {},
				pagingOption: { offset, count: PER_PAGE }
			})
		});
		if (!answer.ok) {
			throw new Error(`Failed to fetch ${url}: ${answer.status}`);
		}
		const data: Records = await answer.json();
		total = data.total ?? 0;
		records.push(...(data.items ?? []));
		if (records.length >= total || !data.items?.length) break;
		offset = data.offset ?? records.length;
	}
	if (records.length < total) {
		throw new Error(`fov: the table gave ${records.length} of the ${total} records it counts`);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const record of records) {
		const fields = record.fields ?? {};
		const name = texts(fields[nameField])[0] ?? '';
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			category: [
				...(sectorField ? texts(fields[sectorField]) : []).map(tag),
				...(countryField ? texts(fields[countryField]) : []).map(tag)
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('fov: the portfolio table names no companies');
	}

	return companies;
}
