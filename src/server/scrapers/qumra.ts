import type { ScrapedCompany } from './types';

const BASE_URL = 'https://qumracapital.com';
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js over sanity since the move off wordpress on 2026-11-16: the
// portfolio page's cards show a logo, the sector and a line on where the
// company stands, and are drawn from records react carries in its payload, a
// company each — its name, its sector, its stage ("Active", "Public",
// "Acquired"), its listing ("NYSE: FVRR", "Acquired by Akamai") and its site.
// the payload is a run of string literals written into the page, read whole
// and searched for the records, each opening on its slug. the sector is kept
// as a tag, a public company with its listing and the Public tag, an acquired
// one with its buyer and the Exited tag. an acquired company has no site, and
// links its page here.

// a company renamed since it was stored is kept under the name it was stored
// as, so it is not taken for a new company ("Empiric Earth" is Nexar, renamed
// in 2026 on combining with Nauto)
const STORED_AS: Record<string, string> = {
	'empiric earth': 'Nexar',
	minute: 'Minute Media'
};

const CHUNK = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
const RECORD = /\{"slug":"/g;
const ACQUIRED = /^acquired$/i;
const PUBLIC = /^public$/i;
const STEALTH = /^stealth\b/i;

interface Record_ {
	slug?: unknown;
	name?: unknown;
	sector?: unknown;
	stage?: unknown;
	listing?: unknown;
	website?: unknown;
}

const text = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => s.replace(/\s*,\s*/g, ' / ');

// the object that opens at `start`, up to the brace that closes it
function objectAt(payload: string, start: number): string {
	let depth = 0;
	let inString = false;
	for (let i = start; i < payload.length; i++) {
		const ch = payload[i];
		if (inString) {
			if (ch === '\\') i++;
			else if (ch === '"') inString = false;
		} else if (ch === '"') inString = true;
		else if (ch === '{') depth++;
		else if (ch === '}' && --depth === 0) return payload.slice(start, i + 1);
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

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const match of payload.matchAll(RECORD)) {
		let record: Record_;
		try {
			record = JSON.parse(objectAt(payload, match.index ?? 0)) as Record_;
		} catch {
			continue;
		}
		const written = text(record.name);
		const name = STORED_AS[written.toLowerCase()] ?? written;
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const stage = text(record.stage);
		const listing = text(record.listing);
		const site = text(record.website);
		const slug = text(record.slug);
		companies.push({
			name,
			category: [
				tag(text(record.sector)),
				PUBLIC.test(stage) || ACQUIRED.test(stage) ? tag(listing) : '',
				PUBLIC.test(stage) ? 'Public' : '',
				ACQUIRED.test(stage) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : slug ? `${PAGE_URL}/${encodeURIComponent(slug)}` : PAGE_URL
		});
	}

	if (companies.length === 0) {
		throw new Error('qumra: no companies found on the portfolio page');
	}

	return companies;
}
