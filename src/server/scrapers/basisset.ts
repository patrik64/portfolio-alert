import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.basisset.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js since the move off webflow on 2026-11-16: the companies page's grid
// is drawn from a list react carries in its payload,
// "portfolio":[{"slug","name","category","status","website"…}…], a company
// each with the system the fund files it under ("Digital Systems", "Physical
// Systems"), its status ("active", "acquired") and its site. the payload is a
// run of string literals written into the page, read whole and searched for
// that list. the system is kept as the tag, an acquired company with the
// Exited tag. a quarter of the list are stealth companies, named only
// "Stealth", and are left out.

const CHUNK = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
const LIST = '"portfolio":[';
const ACQUIRED = /^acquired$/i;
const STEALTH = /^stealth\b/i;

interface Company {
	slug?: unknown;
	name?: unknown;
	category?: unknown;
	status?: unknown;
	website?: unknown;
}

const text = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => s.replace(/\s*,\s*/g, ' / ');

// the array that opens at `start`, up to the bracket that closes it
function arrayAt(payload: string, start: number): string {
	let depth = 0;
	let inString = false;
	for (let i = start; i < payload.length; i++) {
		const ch = payload[i];
		if (inString) {
			if (ch === '\\') i++;
			else if (ch === '"') inString = false;
		} else if (ch === '"') inString = true;
		else if (ch === '[') depth++;
		else if (ch === ']' && --depth === 0) return payload.slice(start, i + 1);
	}
	return '';
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const payload = [...html.matchAll(CHUNK)].map(([, literal]) => JSON.parse(literal) as string).join('');
	const at = payload.indexOf(LIST);
	let list: Company[] = [];
	try {
		list = at < 0 ? [] : (JSON.parse(arrayAt(payload, at + LIST.length - 1)) as Company[]);
	} catch {
		list = [];
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const company of list) {
		const name = text(company.name);
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const site = text(company.website);
		const slug = text(company.slug);
		companies.push({
			name,
			category: [tag(text(company.category)), ACQUIRED.test(text(company.status)) ? 'Exited' : '']
				.filter(Boolean)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : slug ? `${PAGE_URL}/${encodeURIComponent(slug)}` : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('basisset: no companies on the portfolio page');
	}

	return companies;
}
