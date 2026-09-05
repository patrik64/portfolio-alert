import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.tnbaura.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js over wordpress: the page ships the query it made, so the whole
// portfolio is in the flight payload.
//
// a title reads "AcadArena: Fastest Growing Collegiate Esports Platform in
// SEA" — the company, then what it does — so the name is what stands before
// the colon. the status field says how a company ended where it has: an exit,
// an acquisition, or closing down.

const PUSH = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
const MARKER = '"portfolios":';

interface Entry {
	title?: string;
	clientDetails?: {
		websiteUrl?: string;
		country?: string[] | null;
		status?: string[] | null;
		category?: { nodes?: { title?: string }[] };
	};
}

// slice out the array starting at `from`, tracking strings so brackets inside
// a company's write-up can't end it early
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
	throw new Error('tnbaura: the portfolio array never closes');
}

// the fund's own words for how a company ended
const STATUS: Record<string, string> = { exit: 'Exited', 'm&a': 'Acquired' };

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	const payload = [...html.matchAll(PUSH)].map((m) => JSON.parse(m[1]) as string).join('');
	const at = payload.indexOf(MARKER);
	if (at < 0) {
		throw new Error('tnbaura: no portfolio in the page payload');
	}
	const rows = JSON.parse(
		sliceArray(payload, payload.indexOf('[', at + MARKER.length))
	) as Entry[];

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const row of rows) {
		const name = (row.title ?? '').split(':')[0].trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);

		const details = row.clientDetails;
		const tags = [
			...(details?.category?.nodes ?? []).map((n) => (n.title ?? '').trim()),
			...(details?.country ?? []).map((c) => (c ?? '').trim()),
			...(details?.status ?? []).map((s) => STATUS[(s ?? '').toLowerCase()] ?? (s ?? '').trim())
		].filter(Boolean);

		companies.push({
			name,
			category: tags.join(', '),
			url: (details?.websiteUrl ?? '').trim()
		});
	}

	if (companies.length === 0) {
		throw new Error('tnbaura: no companies in the page payload');
	}

	return companies;
}
