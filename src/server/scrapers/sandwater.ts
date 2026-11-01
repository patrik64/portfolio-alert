import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.sandwater.com/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js and sanity: the cards show a name, a line and a theme, and open a popup
// that the page's data fills, so the whole record is in the html, in the chunks
// handed to next's script: the site, the fund, the year it came in, the place, and
// the year it went out where it has.
const CHUNK = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
const COMPANIES = '"companies":';

interface Company {
	name?: string;
	website?: string;
	location?: string;
	investmentYear?: number;
	tags?: string[];
	fund?: { name?: string; exit?: number | string };
}

// the json array that starts at a position in the text
function arrayAt(text: string, from: number): string {
	let depth = 0;
	let quoted = false;
	for (let i = from; i < text.length; i++) {
		const c = text[i];
		if (quoted) {
			if (c === '\\') i++;
			else if (c === '"') quoted = false;
		} else if (c === '"') quoted = true;
		else if (c === '[') depth++;
		else if (c === ']' && --depth === 0) return text.slice(from, i + 1);
	}
	return '[]';
}

// the category is comma-joined, so a label holding a comma would read as two;
// "Oslo, Norway" reads better as its country than as "Oslo / Norway"
const tag = (s: string) => s.replace(/\s*,\s*/g, ' / ').trim();
const place = (s: string) => s.split(',').pop()?.trim() ?? '';

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const flight = [...html.matchAll(CHUNK)].map(([, chunk]) => JSON.parse(`"${chunk}"`) as string).join('');
	const at = flight.indexOf(COMPANIES);
	const list = at < 0 ? [] : (JSON.parse(arrayAt(flight, at + COMPANIES.length)) as Company[]);

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const { name: shown, website, location, investmentYear, tags, fund } of list) {
		const name = shown?.trim();
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({
			name,
			category: [
				...(tags ?? []).map(tag),
				fund?.name ?? '',
				investmentYear ? String(investmentYear) : '',
				place(location ?? ''),
				typeof fund?.exit === 'number' ? 'Exited' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: website ?? ''
		});
	}

	if (companies.length === 0) {
		throw new Error('sandwater: no companies in the page data');
	}

	return companies;
}
