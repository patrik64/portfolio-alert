import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.airbusventures.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// the page is a Next.js app: the server streams the portfolio to the client
// as escaped JSON fragments pushed onto self.__next_f, and the companies sit
// in there as one `"companies":[...]` array of {name, url, filter: [tags]}

// slice out the array starting at `from`, tracking strings so brackets inside
// company descriptions can't end it early
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
	throw new Error('airbusventures: companies array never closes');
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

	const marker = '"companies":';
	const at = payload.indexOf(marker);
	if (at < 0) {
		throw new Error('airbusventures: no companies array in the page payload');
	}

	const parsed: { name?: string; url?: string; filter?: string[] }[] = JSON.parse(
		sliceArray(payload, payload.indexOf('[', at + marker.length))
	);

	const companies: ScrapedCompany[] = [];
	for (const c of parsed) {
		const name = (c.name ?? '').trim();
		if (!name) continue;
		companies.push({
			name,
			category: (c.filter ?? []).join(', '),
			url: c.url ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('airbusventures: no companies found in the payload');
	}

	return companies;
}
