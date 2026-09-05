import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.radius.capital/portfolio';
const PAGE_JSON = 'https://static.wixstatic.com/sites';
const ROUTE = './portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// wix, and the portfolio page itself holds nothing: a heading and an embedded
// html widget that wix serves from its own host. the widget is where the fund
// keeps its companies, as a hand-edited javascript array with a comment above
// it explaining how to add one.
//
// reaching it takes three steps, each of which the page spells out. the page
// names the id of the route it is serving, maps that id to the file its
// structure lives in, and gives the host its embedded widgets are served
// from; the structure names the widget's file; the widget holds the array.
//
// the fund publishes a name, an address and a sentence for each company, and
// no sectors — so no category is recorded rather than one being made up from
// the sentence.

const ROUTES = /"\.\\?\/portfolio":\{"type":"Static","pageId":"([^"]+)"\}/;
const PAGE_FILE = (id: string) => new RegExp(`"${id}":"([^"]+\\.json)"`);
const EMBED_HOST = /"staticHTMLComponentUrl":"([^"]+)"/;
const EMBED_FILE = /"type":"HtmlComponent"[\s\S]{0,400}?"url":"([^"]+)"/;
const LIST = /const COMPANIES\s*=\s*\[([\s\S]*?)\];/;
const ENTRY = /\{([^{}]*)\}/g;
const FIELD = (key: string) => new RegExp(`\\b${key}\\s*:\\s*"([^"]*)"`);

const clean = (s: string) => s.replace(/\\\//g, '/').replace(/\s+/g, ' ').trim();

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const page = await fetchText(PAGE_URL);

	const pageId = page.match(ROUTES)?.[1];
	if (!pageId) {
		throw new Error(`radius: the site names no page behind ${ROUTE}`);
	}
	const file = page.match(PAGE_FILE(pageId))?.[1];
	const host = clean(page.match(EMBED_HOST)?.[1] ?? '');
	if (!file || !host) {
		throw new Error('radius: the page does not say where its structure or its widgets live');
	}

	const structure = await fetchText(`${PAGE_JSON}/${file}.z?v=3`);
	const embed = structure.match(EMBED_FILE)?.[1];
	if (!embed) {
		throw new Error('radius: the portfolio page holds no embedded widget');
	}

	const widget = await fetchText(`${host.replace(/\/$/, '')}/${clean(embed).replace(/^\//, '')}`);
	const list = widget.match(LIST)?.[1];
	if (!list) {
		throw new Error('radius: the widget holds no list of companies');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const m of list.matchAll(ENTRY)) {
		const name = clean(m[1].match(FIELD('name'))?.[1] ?? '');
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({
			name,
			category: '',
			url: clean(m[1].match(FIELD('url'))?.[1] ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('radius: no companies in the portfolio widget');
	}

	return companies;
}
