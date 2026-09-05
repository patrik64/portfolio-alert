import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.pioneerfund.vc';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const PAGE_SIZE = 100;

// the site is softr over the fund's airtable base, so the page itself is an
// empty shell: the companies are fetched afterwards from a datasource route
// the fund's own domain proxies.
//
// the route is addressed by four ids — the app, the page, the block and the
// datasource — and all four are in the shell, so they are read from it rather
// than written down here and left to rot when the fund rebuilds the page.
//
// cellFormat "string" is what the block itself asks for, and it matters: the
// YC batch is a link to another table, so json returns a record id where
// string returns the batch, which is the only thing the fund files a company
// under.

const APP = /data-appid="([0-9a-f-]{36})"/i;
const PAGE = /data-pageid="([0-9a-f-]{36})"/i;
const SOURCE = /"dataSources":\[\{"id":"([0-9a-f-]{36})"/;
// the block that owns the datasource is the last one declared before it
const BLOCK = /"id":"([0-9a-f-]{36})","version":"/g;

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a batch written with a comma in it would
// read as two tags rather than one
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

interface Row {
	fields?: { Name?: string; Website?: string; 'YC Batch'?: string };
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const shell = await resp.text();

	const source = shell.match(SOURCE);
	const app = shell.match(APP)?.[1];
	const page = shell.match(PAGE)?.[1];
	if (!source || !app || !page) {
		throw new Error('pioneer: the page names no datasource to read the companies from');
	}
	const block = [...shell.slice(0, source.index).matchAll(BLOCK)].pop()?.[1];
	if (!block) {
		throw new Error('pioneer: the datasource belongs to no block');
	}
	const url = `${BASE_URL}/v1/datasource/airtable/${app}/${page}/${block}/${source[1]}/data`;

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	let offset: string | null = null;
	for (let request = 0; request < 40; request++) {
		const dataResp: Response = await fetch(url, {
			method: 'POST',
			headers: {
				'User-Agent': UA,
				'Content-Type': 'application/json',
				'Accept-Language': 'en-US'
			},
			body: JSON.stringify({
				options: { cellFormat: 'string', timeZone: 'UTC', userLocale: 'en-US' },
				pageContext: null,
				filterCriteria: {},
				pagingOption: { offset, count: PAGE_SIZE }
			})
		});
		if (!dataResp.ok) {
			throw new Error(`Failed to fetch ${url}: ${dataResp.status}`);
		}
		const body: { records?: Row[]; offset?: string } = await dataResp.json();

		for (const row of body.records ?? []) {
			const name = clean(row.fields?.Name ?? '');
			if (!name || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());

			companies.push({
				name,
				category: tag(row.fields?.['YC Batch'] ?? ''),
				url: clean(row.fields?.Website ?? '')
			});
		}

		offset = body.offset ?? null;
		if (!offset || !body.records?.length) break;
	}

	if (companies.length === 0) {
		throw new Error('pioneer: no companies in the portfolio table');
	}

	return companies;
}
