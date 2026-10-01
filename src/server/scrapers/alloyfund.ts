import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.alloyfund.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// create react app: the portfolio page is an empty shell its script fills
// with a grid of companies compiled into it, each with its name, its site,
// a logo and a line about it. the home page's shorter "select portfolio"
// list and the partners are in the same script, but carry no line, and so
// are told apart. the script's name is hashed per build, so the shell is
// read for it each run. nothing marks an exit.

const CHUNK = /<script\b[^>]*\bsrc="(\/static\/js\/[^"]+\.js)"/g;
// a grid entry: a name, a site, a logo or none, and a line
const ENTRY = /\{name:"((?:[^"\\]|\\.)*)",url:"((?:[^"\\]|\\.)*)",logo:(?:"(?:[^"\\]|\\.)*"|null),tagline:"(?:[^"\\]|\\.)*"/g;
const STEALTH = /^stealth\b/i;

// a javascript string's contents, its escapes undone where json reads them
const unquote = (s: string) => {
	try {
		return JSON.parse(`"${s}"`) as string;
	} catch {
		return s;
	}
};

async function fetchText(url: string): Promise<string> {
	const resp = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${url}: ${resp.status}`);
	}
	return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const shell = await fetchText(PAGE_URL);
	// the app's own script first, then the libraries'
	const chunks = [...new Set([...shell.matchAll(CHUNK)].map(([, src]) => src))].sort(
		(a, b) => Number(!/\/main\./.test(a)) - Number(!/\/main\./.test(b))
	);
	let entries: [string, string][] = [];
	for (const chunk of chunks) {
		entries = [...(await fetchText(`${BASE_URL}${chunk}`)).matchAll(ENTRY)].map(([, name, url]) => [
			unquote(name),
			unquote(url)
		]);
		if (entries.length > 0) break;
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [written, url] of entries) {
		const name = written.replace(/\s+/g, ' ').trim();
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const site = url.trim();
		companies.push({ name, category: '', url: /^https?:\/\//i.test(site) ? site : PAGE_URL });
	}
	if (companies.length === 0) {
		throw new Error('alloyfund: no script on the portfolio page carries the companies');
	}

	return companies;
}
