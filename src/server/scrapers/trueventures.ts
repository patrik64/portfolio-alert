import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.trueventures.com/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js, and server-rendered: every company is a link whose aria-label names
// it, written for the reader who cannot see the logo. the page repeats a
// company where it belongs to more than one of its bands, so the links are
// deduplicated by name.
//
// a "highlights" array in the flight payload gives sectors, but only for the
// companies the fund features — the rest come back with no category rather
// than a guessed one.

const ANCHOR =
	/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*aria-label="([^"]*?) \(opens in new tab\)"/g;
const PUSH = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;

interface Highlight {
	name?: string;
	sectors?: string[];
}

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
	throw new Error('trueventures: the highlights array never closes');
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	// sectors, for the companies that have them
	const sectors = new Map<string, string>();
	const payload = [...html.matchAll(PUSH)].map((m) => JSON.parse(m[1]) as string).join('');
	const marker = '"highlights":';
	const at = payload.indexOf(marker);
	if (at >= 0) {
		const highlights = JSON.parse(
			sliceArray(payload, payload.indexOf('[', at + marker.length))
		) as Highlight[];
		for (const entry of highlights) {
			const name = (entry.name ?? '').trim();
			const tags = (entry.sectors ?? []).map((s) => s.trim()).filter(Boolean);
			if (name && tags.length > 0) sectors.set(name, tags.join(', '));
		}
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const [, url, label] of html.matchAll(ANCHOR)) {
		const name = label.trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);
		companies.push({ name, category: sectors.get(name) ?? '', url });
	}

	if (companies.length === 0) {
		throw new Error('trueventures: no companies on the portfolio page');
	}

	return companies;
}
