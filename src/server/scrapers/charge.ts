import type { ScrapedCompany } from './types';

const BASE_URL = 'https://charge.vc';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// nuxt with its content module, built as a static site: the pages are
// drawn in the browser from a database the build writes out as one json
// file, named by a hash the page carries. the portfolio page shows every
// company in it, each with a line about it, its site (written without its
// scheme) and an exit flag, which the page shows as a badge.

const HASH = /\bcontent:\{dbHash:"([0-9a-f]+)"/;
const STEALTH = /^stealth\b/i;

interface Item {
	dir?: string;
	name?: unknown;
	url?: unknown;
	exit?: unknown;
}

const text = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

// "adaptframework.solutions/" is a site too
const siteOf = (written: string) =>
	!written || /\s/.test(written) || !/\.[a-z]{2,}/i.test(written)
		? ''
		: /^https?:\/\//i.test(written)
			? written
			: `https://${written}`;

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const hash = (await fetchText(PAGE_URL)).match(HASH)?.[1];
	if (!hash) {
		throw new Error('charge: the portfolio page names no content database');
	}
	const db = JSON.parse(await fetchText(`${BASE_URL}/_nuxt/content/db-${hash}.json`)) as {
		_collections?: { _data?: Item[] }[];
	};
	const items = (db._collections ?? []).flatMap((c) => c?._data ?? []).filter((i) => i?.dir === '/companies');

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of items) {
		const name = text(item.name);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			category: item.exit === true ? 'Exited' : '',
			url: siteOf(text(item.url)) || PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('charge: no companies in the content database');
	}

	return companies;
}
