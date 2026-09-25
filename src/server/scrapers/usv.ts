import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.usv.com/companies/';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js, its content in sanity. the companies page draws a card per company
// — a logo, the round and year the fund came in, and a badge for how it
// stands ("NASDAQ: COIN", "Acquired by Prosus") — from records the page ships
// in its flight data, which carry the same and the company's site: its
// current one, or the address the old site linked. "Acquired by Twitter" and
// "NYSE: NET" are milestones as usv states them, not a claim that the fund is
// out, so they are kept as written without the Exited tag, as before.

const FLIGHT = /self\.__next_f\.push\(\[1,"((?:\\.|[^"\\])*)"\]\)/g;
const RECORD = /\{"_id":"company-[^"]*"/g;

interface Company {
	name?: string;
	investmentRound?: string | null;
	investmentYear?: number | null;
	statusNote?: string | null;
	website?: string | null;
	legacyUrl?: string | null;
}

const clean = (s: string) => s.replace(/[\u200b]/g, '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a note holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// the json object starting at `from`, read to its matching brace
function objectAt(text: string, from: number): string {
	let depth = 0;
	let quoted = false;
	for (let i = from; i < text.length; i++) {
		const c = text[i];
		if (quoted) {
			if (c === '\\') i++;
			else if (c === '"') quoted = false;
		} else if (c === '"') quoted = true;
		else if (c === '{') depth++;
		else if (c === '}' && --depth === 0) return text.slice(from, i + 1);
	}
	return '';
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const flight = [...html.matchAll(FLIGHT)].map((m) => JSON.parse(`"${m[1]}"`) as string).join('');

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const m of flight.matchAll(RECORD)) {
		let record: Company;
		try {
			record = JSON.parse(objectAt(flight, m.index ?? 0)) as Company;
		} catch {
			continue;
		}
		const name = clean(record.name ?? '');
		if (!name || /^stealth\b/i.test(name) || seen.has(name)) continue;
		seen.add(name);
		const stage = [record.investmentRound, record.investmentYear].filter(Boolean).join(', ');
		companies.push({
			name,
			category: [clean(stage), tag(record.statusNote ?? '')].filter(Boolean).join(', '),
			url: clean(record.website || record.legacyUrl || '')
		});
	}

	if (companies.length === 0) {
		throw new Error('usv: no company records in the companies page');
	}

	return companies;
}
