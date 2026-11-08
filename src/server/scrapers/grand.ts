import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://grandvcp.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js over payload cms, drawn on the server: a card a company with its
// name, a line about it, a link to its site and, for one sold, an "Exited"
// badge and who bought it ("Acquired by Figma"). the page's filter also sorts
// companies as inactive, which no card shows, so the companies are read from
// the cms records react carries in its payload rather than from the cards:
// each has the name, the site, a status ("active", "exited", "inactive"), the
// buyer and, for a few, a sector ("Developer Tools"). the sector is kept as a
// tag, an exit as "Acquired by …" with the Exited tag and an inactive company
// with the Closed tag. one inactive company has a buyer on record that its
// card leaves out, and it is left out here too.

// react's payload, written into the page as a run of string literals
const CHUNK = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
// where a company's record opens; its image and post records open the same
// way but carry no status
const RECORD = /\{"id":\d+,"name":"/g;
const STEALTH = /^stealth\b/i;

interface Company {
	name?: unknown;
	website?: unknown;
	sector?: unknown;
	status?: unknown;
	acquiredBy?: unknown;
}

// the object that opens at `start`, up to the brace that closes it
function objectAt(text: string, start: number): string {
	let depth = 0;
	let inString = false;
	for (let i = start; i < text.length; i++) {
		const ch = text[i];
		if (inString) {
			if (ch === '\\') i++;
			else if (ch === '"') inString = false;
		} else if (ch === '"') inString = true;
		else if (ch === '{') depth++;
		else if (ch === '}' && --depth === 0) return text.slice(start, i + 1);
	}
	return '';
}

const text = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => s.replace(/\s*,\s*/g, ' / ');

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const payload = [...html.matchAll(CHUNK)].map(([, literal]) => JSON.parse(literal) as string).join('');

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const { index } of payload.matchAll(RECORD)) {
		let record: Company;
		try {
			record = JSON.parse(objectAt(payload, index)) as Company;
		} catch {
			continue;
		}
		const name = text(record.name);
		const status = text(record.status).toLowerCase();
		if (!name || !status || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const exited = status === 'exited';
		const buyer = exited ? text(record.acquiredBy) : '';
		companies.push({
			name,
			category: [
				tag(text(record.sector)),
				buyer ? `Acquired by ${tag(buyer)}` : '',
				exited ? 'Exited' : status === 'inactive' ? 'Closed' : ''
			]
				.filter(Boolean)
				.join(', '),
			url: text(record.website) || PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('grand: no company records in the page payload — the markup moved');
	}

	return companies;
}
