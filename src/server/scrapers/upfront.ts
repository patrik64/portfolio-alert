import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://upfront.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// the served page is an empty angular shell; the portfolio lives in contentful
// and is fetched in the browser. the space and the read-only delivery key the
// site hands every visitor sit in its javascript bundle, whose own url is
// hashed per deploy — so both are read from the page each run rather than
// written down here.
//
// the page's "Upfront Portfolio Companies" block is set to show every company
// entry rather than a chosen few, so the whole content type is the portfolio.

const BUNDLE = /<script src='(https?:\/\/[^']+\.js)'/;
const CONFIG = /space:"([\w-]+)",accessToken:"([\w-]+)"/;

interface Entry {
	fields?: {
		name?: string;
		location?: string;
		website?: string;
		status?: string;
	};
}

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const shell = await fetchText(PAGE_URL);
	const bundleUrl = shell.match(BUNDLE)?.[1];
	if (!bundleUrl) {
		throw new Error('upfront: no script bundle in the page shell');
	}

	const config = (await fetchText(bundleUrl)).match(CONFIG);
	if (!config) {
		throw new Error('upfront: no contentful space in the bundle');
	}
	const [, space, token] = config;

	const api = new URL(`https://cdn.contentful.com/spaces/${space}/entries`);
	api.searchParams.set('access_token', token);
	api.searchParams.set('content_type', 'company');
	api.searchParams.set('limit', '1000');
	api.searchParams.set('select', 'fields.name,fields.status,fields.location,fields.website');

	const resp = await fetch(api, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch the contentful entries: ${resp.status}`);
	}
	const { items } = (await resp.json()) as { items?: Entry[] };

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const item of items ?? []) {
		const name = (item.fields?.name ?? '').trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);

		// a company still in the portfolio carries no status at all
		const status = (item.fields?.status ?? '').trim();
		const tags = [
			(item.fields?.location ?? '').trim(),
			/^ipo$/i.test(status) ? 'Exited' : status
		].filter(Boolean);

		companies.push({
			name,
			category: tags.join(', '),
			url: (item.fields?.website ?? '').trim()
		});
	}

	if (companies.length === 0) {
		throw new Error('upfront: no companies in the contentful space');
	}

	return companies;
}
