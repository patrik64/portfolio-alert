import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.trueventures.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js, and server-rendered: every company is a link whose aria-label names
// it, written for the reader who cannot see the logo. the page repeats a
// company where it belongs to more than one of its bands, so the links are
// deduplicated by name.
//
// three arrays in the flight payload — highlights, exits, all — give each
// company its sectors; the featured exit cards say besides how the exit went
// (IPO, Acquired by Cisco). the page used to render only the highlights and
// the featured exits as links; since september 2026 the whole portfolio is.

const ANCHOR =
	/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*aria-label="([^"]*?) \(opens in new tab\)"([\s\S]*?)<\/a>/g;
const OUTCOME = /font-mono[^>]*>([^<]+)</;
const PUSH = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
const LISTS = ['highlights', 'exits', 'all'];

interface Entry {
	name?: string;
	sectors?: string[];
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// slice out the array starting at `from`, tracking strings so brackets inside
// a description can't end it early
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
	throw new Error('trueventures: a list in the payload never closes');
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	// sectors by name, the lists' spellings differing from the links' now and
	// then ("Duo" for Duo Security), so the lookup ignores case
	const sectors = new Map<string, string>();
	const payload = [...html.matchAll(PUSH)].map((m) => JSON.parse(m[1]) as string).join('');
	for (const list of LISTS) {
		const marker = `"${list}":[`;
		const at = payload.indexOf(marker);
		if (at < 0) continue;
		const entries = JSON.parse(sliceArray(payload, at + marker.length - 1)) as Entry[];
		for (const entry of entries) {
			const name = clean(entry.name ?? '').toLowerCase();
			const tags = (entry.sectors ?? []).map(clean).filter(Boolean);
			if (name && tags.length > 0 && !sectors.has(name)) sectors.set(name, tags.join(', '));
		}
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, url, label, body] of html.matchAll(ANCHOR)) {
		const name = clean(label);
		if (!name || seen.has(name)) continue;
		seen.add(name);
		const outcome = clean(body.match(OUTCOME)?.[1] ?? '');
		companies.push({
			name,
			category: [sectors.get(name.toLowerCase()) ?? '', outcome].filter(Boolean).join(', '),
			url
		});
	}

	if (companies.length === 0) {
		throw new Error('trueventures: no companies on the portfolio page');
	}

	return companies;
}
