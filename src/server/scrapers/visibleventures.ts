import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://visibleventures.com/portfolio/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// the page is a Next.js app: the server streams the rendered tree to the
// client as escaped JSON fragments pushed onto self.__next_f. the "All
// companies" logo grid is the full list, one
// ["$","div","<name>",{"className":"group relative flex items-center ..."}]
// per company, keyed by the company name, carrying an "Exit" badge span when
// the company has exited. the hero mosaic above it repeats a handful of those
// same companies as photos, so the grid alone is the portfolio.
//
// nothing on the page links out — the logos are plain images — so the
// companies come back without websites.

// the grid's own card class — the only other "group relative" on the page is
// the hero mosaic's, which has no name key
const GRID_ITEM =
	/\["\$","div","((?:[^"\\]|\\.)+)",\{"className":"group relative flex items-center/g;

// slice out the array starting at `from`, tracking strings so brackets inside
// class names or text can't end it early
function sliceArray(payload: string, from: number): string {
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
		else if (ch === '[') depth++;
		else if (ch === ']' && --depth === 0) return payload.slice(from, i + 1);
	}
	throw new Error('visibleventures: a portfolio grid item never closes');
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

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const m of payload.matchAll(GRID_ITEM)) {
		const name = (JSON.parse(`"${m[1]}"`) as string).trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);
		// the badge under an exited company's logo
		const exited = /"children":"Exit"/.test(sliceArray(payload, m.index));
		companies.push({ name, category: exited ? 'Exited' : '', url: '' });
	}

	if (companies.length === 0) {
		throw new Error('visibleventures: no companies in the page payload');
	}

	return companies;
}
