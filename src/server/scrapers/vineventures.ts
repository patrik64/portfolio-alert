import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://vineventures.com/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js over sanity, rebuilt on 2026-11-11: the front page's portfolio is
// drawn by the browser from the content react carries in its payload, where
// it is a plain list — "portfolio":{"companies":[{"name","url"}…]} — of names
// and sites, with no sector or region any more. the payload is a run of
// string literals written into the page, read whole and searched for that
// list.
//
// the rebuild shortened a few names the old page wrote out ("Ornn AI" is now
// "Ornn", "Qodo (fka CodiumAI)" is "Qodo"), and each is kept under the name
// it was stored as, so it is not taken for a new company.
const STORED_AS: Record<string, string> = {
	datum: 'Datum Technology',
	'g2 systems': 'G2 Systems and Technologies',
	ornn: 'Ornn AI',
	qodo: 'Qodo (fka CodiumAI)',
	wonderful: 'Wonderful Systems'
};

const CHUNK = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
const LIST = '"portfolio":{"companies":';
// rows named "StealthCo" were unannounced placeholders on the old page
const STEALTH = /^stealth/i;

interface Company {
	name?: unknown;
	url?: unknown;
}

// the array that opens at `start`, up to the bracket that closes it
function arrayAt(text: string, start: number): string {
	let depth = 0;
	let inString = false;
	for (let i = start; i < text.length; i++) {
		const ch = text[i];
		if (inString) {
			if (ch === '\\') i++;
			else if (ch === '"') inString = false;
		} else if (ch === '"') inString = true;
		else if (ch === '[') depth++;
		else if (ch === ']' && --depth === 0) return text.slice(start, i + 1);
	}
	return '';
}

const text = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

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
		list = at < 0 ? [] : (JSON.parse(arrayAt(payload, at + LIST.length)) as Company[]);
	} catch {
		list = [];
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const company of list) {
		const written = text(company.name).replace(/\*$/, '');
		const name = STORED_AS[written.toLowerCase()] ?? written;
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		companies.push({ name, category: '', url: text(company.url) || PAGE_URL });
	}

	if (companies.length === 0) {
		throw new Error('vineventures: no companies on the page');
	}

	return companies;
}
