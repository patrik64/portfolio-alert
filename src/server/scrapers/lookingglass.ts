import type { ScrapedCompany } from './types';

const BASE_URL = 'https://lookingglass.vc';
const PAGE_URL = `${BASE_URL}/investments`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// a single-page react app (it replaced a dozing wordpress site in september
// 2026) whose bundle carries the whole portfolio as a literal array: name,
// theme, fund, a one-liner and the company's bare domain. the page names its
// scripts, the scripts are fetched, and the array is read from whichever
// holds it. the theme (Health, Climate, Empowerment) is the fund's own
// filing and becomes the category; the fund number is a vehicle and is not.
// one company really is called "untitled" — untitled.stream — and stays.

const SCRIPT = /<script[^>]*src="(\/assets\/[^"]+\.js)"/g;
const ENTRY = '{name:"';

const field = (chunk: string, name: string) =>
	new RegExp(`${name}:"([^"]*)"`).exec(chunk)?.[1] ?? '';

async function fetchText(url: string) {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const html = await fetchText(PAGE_URL);
	const scripts = [...html.matchAll(SCRIPT)].map((m) => m[1]);
	if (scripts.length === 0) {
		throw new Error('lookingglass: the page names no scripts to read');
	}

	let bundle = '';
	for (const src of scripts) {
		const js = await fetchText(`${BASE_URL}${src}`);
		if (js.includes(ENTRY)) {
			bundle = js;
			break;
		}
	}
	if (!bundle) {
		throw new Error('lookingglass: no script carries the portfolio array');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const chunk of bundle.split(ENTRY).slice(1)) {
		const name = chunk.slice(0, chunk.indexOf('"')).trim();
		const theme = field(chunk, 'theme');
		// the theme buttons are drawn from the same kind of object, minus the
		// fields a company carries
		if (!name || !theme || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());

		const site = field(chunk, 'site');
		companies.push({
			name,
			category: theme,
			url: site ? `https://${site}` : ''
		});
	}

	if (companies.length === 0) {
		throw new Error('lookingglass: no companies in the portfolio array');
	}

	return companies;
}
