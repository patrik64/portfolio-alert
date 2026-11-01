import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://adevinta.com/brands/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wordpress: a tile per brand with its name and country as attributes, for the
// page's filter, linking the brand's page on the site, which has its address. the
// group owns these marketplaces rather than backs them, so none is ever exited.
const TILE = /<a\s+data-brand-name="([^"]*)"\s+href="([^"]*)"[^>]*\bdata-country="([^"]*)"/g;
const LINK = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/g;
const NOT_THE_BRAND = /\/\/(?:[\w-]+\.)*(?:adevinta|linkedin|twitter|x|facebook|instagram|youtube)\.com\b/i;

const clean = (s: string) =>
	s
		.replace(/&amp;|&#038;/g, '&')
		.replace(/&#0?39;|&#8217;/g, "'")
		.replace(/\s+/g, ' ')
		.trim();

async function read(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const tiles = [...(await read(PAGE_URL)).matchAll(TILE)];
	if (tiles.length === 0) {
		throw new Error('adevinta: no brands on the page');
	}

	return Promise.all(
		tiles.map(async ([, name, page, country]) => ({
			name: clean(name).replace(/\s*\/\s*/g, '/'),
			category: clean(country),
			url: [...(await read(page)).matchAll(LINK)].map(([, href]) => href).find((href) => !NOT_THE_BRAND.test(href)) ?? ''
		}))
	);
}
