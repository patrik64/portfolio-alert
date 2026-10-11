import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://portfolio.breega.com/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MAX_PAGES = 50;

// softr: the portfolio is a list block the page draws in the browser from an
// airtable view ("Published"), which it asks softr for through the site's
// own data endpoint — named by the app, the page, the block and its data
// source, all read from the page each run. a company's record gives its
// name, a line about it, the year the fund invested, its industries
// ("FinTech", "SaaS"), its stage ("Series A"), its country and its status:
// "Owned", "Exit", or how it failed ("Written-off", "Liquidated"), kept as a
// tag without the Exited tag. the industries, the stage, the country and
// the year are kept as tags. the records name no sites, so every company
// links the page.

const APP = /\bdata-appid="([^"]+)"/;
const PAGE = /\bdata-pageId="([^"]+)"/;
const BLOCKS = 'var softrBlocks = ';
const EXIT = /^exit(?:ed)?$/i;
const UNSAID = /^(?:-|other|others|all|n\/a|owned)$/i;
const STEALTH = /^stealth\b/i;

interface Block {
	id?: string;
	name?: string;
	collection?: { dataSources?: { id?: string }[] };
}

interface Fields {
	Startup?: string;
	Status?: string;
	'Year invested'?: number | string;
	Industry?: string[] | string;
	Stage?: string;
	Location?: string;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const list = (v: string[] | string | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

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

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	// the list block and the data source it draws from
	const app = html.match(APP)?.[1];
	const page = html.match(PAGE)?.[1];
	const at = html.indexOf(BLOCKS);
	const blocks = at >= 0 ? (jsonAt(html, at + BLOCKS.length) as Block[] | undefined) : undefined;
	const block = (blocks ?? []).find((b) => b.name === 'list' && b.collection?.dataSources?.[0]?.id);
	const source = block?.collection?.dataSources?.[0]?.id;
	if (!app || !page || !block?.id || !source) {
		throw new Error("breega: the page names no list block to read — softr's page moved");
	}
	const endpoint = `${new URL(PAGE_URL).origin}/v1/datasource/airtable/${app}/${page}/${block.id}/${source}/data`;

	// the records, a page at a time while softr hands back an offset
	const records: { fields?: Fields }[] = [];
	let offset: string | null | undefined;
	for (let n = 0; n < MAX_PAGES; n++) {
		const answer = await fetch(endpoint, {
			method: 'POST',
			headers: {
				'User-Agent': UA,
				'Content-Type': 'application/json',
				Accept: 'application/json',
				'softr-page-id': page,
				Referer: PAGE_URL
			},
			body: JSON.stringify(offset ? { offset } : {})
		});
		if (!answer.ok) {
			throw new Error(`breega: softr's data endpoint answered ${answer.status}`);
		}
		const data = (await answer.json()) as { records?: { fields?: Fields }[]; offset?: string | null };
		records.push(...(data.records ?? []));
		offset = data.offset;
		if (!offset) break;
	}
	// a list cut short by its offset must not pass for the whole
	if (offset) {
		throw new Error(`breega: softr still had records after ${MAX_PAGES} pages`);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const { fields = {} } of records) {
		const name = clean(fields.Startup ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const status = clean(fields.Status ?? '');
		const year = String(fields['Year invested'] ?? '').match(/\b(?:19|20)\d{2}\b/)?.[0];
		companies.push({
			name,
			category: [
				...list(fields.Industry).map(tag),
				tag(fields.Stage ?? ''),
				tag(fields.Location ?? ''),
				year ? `Invested ${year}` : '',
				EXIT.test(status) ? '' : tag(status),
				EXIT.test(status) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && !UNSAID.test(t) && all.indexOf(t) === i)
				.join(', '),
			url: PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('breega: softr gave no companies');
	}

	return companies;
}
