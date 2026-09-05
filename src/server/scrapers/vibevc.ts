import type { ScrapedCompany } from './types';

const BASE_URL = 'https://vibe.vc';
const PAGE_URL = `${BASE_URL}/companies`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// the site is a Notion page published through Super, served by a Next.js app:
// the flight payload carries the whole Notion workspace slice as a
// `"records":{...}` object. one block in there is the gallery itself
// (type "collection_page"); its view lists the company block ids in display
// order and names the database columns, so the column ids — Notion's opaque
// "m;rK"/"sfJL" keys — get looked up instead of guessed. every company block
// then holds its Notion title, its multi-select tags and its website url.

interface Block {
	type?: string;
	uri?: string;
	// notion rich text: [[text, annotations?], ...]
	title?: unknown[];
	propertyValues?: Record<string, unknown[]>;
	views?: {
		items?: string[];
		visibleColumns?: { id?: string; type?: string }[];
	}[];
}

// slice out the object starting at `from`, tracking strings so braces inside
// text can't end it early
function sliceObject(payload: string, from: number): string {
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let i = from; i < payload.length; i++) {
		const ch = payload[i];
		if (inString) {
			if (escaped) escaped = false;
			else if (ch === '\\') escaped = true;
			else if (ch === '"') inString = false;
		} else if (ch === '"') inString = true;
		else if (ch === '{') depth++;
		else if (ch === '}' && --depth === 0) return payload.slice(from, i + 1);
	}
	throw new Error('vibevc: the records object never closes');
}

// notion rich text flattens to the concatenated text of its segments
function plainText(rich: unknown): string {
	if (!Array.isArray(rich)) return '';
	return rich
		.map((seg) => (Array.isArray(seg) && typeof seg[0] === 'string' ? seg[0] : ''))
		.join('')
		.trim();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	// each push carries one escaped JS string literal; parsing it as a JSON
	// string undoes the escaping, and joining restores the full payload
	const payload = [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)]
		.map((m) => JSON.parse(m[1]) as string)
		.join('');

	const marker = '"records":';
	const at = payload.indexOf(marker);
	if (at < 0) {
		throw new Error('vibevc: no notion records in the page payload');
	}
	const records = JSON.parse(sliceObject(payload, payload.indexOf('{', at + marker.length))) as {
		block?: Record<string, Block>;
	};
	const blocks = records.block ?? {};

	// the gallery block, and within it the view listing the most companies
	const gallery = Object.values(blocks).find((b) => b.type === 'collection_page');
	let view: NonNullable<Block['views']>[number] | undefined;
	for (const candidate of gallery?.views ?? []) {
		if ((candidate.items?.length ?? 0) > (view?.items?.length ?? 0)) view = candidate;
	}
	const ids = view?.items ?? [];
	if (ids.length === 0) {
		throw new Error('vibevc: the companies gallery lists no items');
	}

	// the view names its columns, so the tag and website property ids come
	// from the page rather than from hardcoded notion keys
	const columns = view?.visibleColumns ?? [];
	const tagIds = columns.filter((c) => c.type === 'multi_select' && c.id).map((c) => c.id!);
	const urlId = columns.find((c) => c.type === 'url' && c.id)?.id;

	const companies: ScrapedCompany[] = [];
	for (const id of ids) {
		const block = blocks[id];
		if (!block) continue;
		const name = plainText(block.title);
		if (!name) continue;

		const category = tagIds
			.flatMap((tagId) =>
				(block.propertyValues?.[tagId] ?? []).map((t) =>
					typeof t === 'object' && t && 'value' in t ? String((t as { value: unknown }).value) : ''
				)
			)
			.filter(Boolean)
			.join(', ');

		let url = urlId ? plainText(block.propertyValues?.[urlId]) : '';
		if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
		// a company with no website listed falls back to its page on vibe.vc
		if (!url && block.uri) url = `${BASE_URL}${block.uri}`;

		companies.push({ name, category, url });
	}

	if (companies.length === 0) {
		throw new Error('vibevc: no companies in the notion records');
	}

	return companies;
}
