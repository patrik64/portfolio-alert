import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.trueventures.com/companies';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js, server-rendered. since october 2026 the portfolio is at
// /companies (/portfolio redirects there) and only the highlighted companies
// are drawn as links, each linking its site; the rest are drawn in the
// browser from three lists in the page's flight payload — highlights, all
// (the companies held, highlights among them) and exits — a company each
// with a line about it and its sectors. a map beside them, drawn as the
// portfolio's growth, gives the date the fund came into each company. the
// lists' companies are the portfolio; the sectors and the year the fund came
// in are kept as tags, a company on the exits list with the Exited tag. a
// company that is not highlighted links the page here.

const PUSH = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
const LISTS = ['highlights', 'all', 'exits'] as const;
const LINK = /<a href="(https?:\/\/[^"]+)"[^>]*>([^<]{1,80})<\/a>/g;
const STEALTH = /^stealth\b/i;

// a company the site renamed after it was stored, kept under the stored
// name so the rename is not taken for a new company
const STORED_AS: Record<string, string> = {
	duo: 'Duo Security'
};

interface Entry {
	name?: string;
	sectors?: string[];
}

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// the JSON array or object starting at `from`, tracking strings so brackets
// inside a description can't end it early
function jsonAt(payload: string, from: number): unknown {
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
		else if (ch === '[' || ch === '{') depth++;
		else if ((ch === ']' || ch === '}') && --depth === 0) return JSON.parse(payload.slice(from, i + 1));
	}
	throw new Error('trueventures: a value in the payload never closes');
}

// the value after `"key":` in the payload, or nothing when the key is absent
function valueOf(payload: string, key: string): unknown {
	const marker = `"${key}":`;
	const at = payload.indexOf(marker);
	if (at < 0) return undefined;
	const from = at + marker.length;
	return payload[from] === '[' || payload[from] === '{' ? jsonAt(payload, from) : undefined;
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();
	const payload = [...html.matchAll(PUSH)].map((m) => JSON.parse(m[1]) as string).join('');

	const since = (valueOf(payload, 'since') ?? {}) as Record<string, string>;
	const sinceByName = new Map(Object.entries(since).map(([name, date]) => [clean(name).toLowerCase(), date]));
	const sites = new Map<string, string>();
	for (const [, url, label] of html.matchAll(LINK)) {
		const name = clean(label).toLowerCase();
		if (!/trueventures\.com/i.test(url) && !sites.has(name)) sites.set(name, url);
	}

	const exited = new Set<string>();
	const entries: Entry[] = [];
	for (const list of LISTS) {
		const value = valueOf(payload, list);
		if (!Array.isArray(value)) continue;
		for (const entry of value as Entry[]) {
			const name = clean(entry.name ?? '');
			if (list === 'exits' && name) exited.add(name.toLowerCase());
			entries.push(entry);
		}
	}
	if (entries.length === 0) {
		throw new Error('trueventures: no company lists in the page payload — the page moved');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const entry of entries) {
		const given = clean(entry.name ?? '');
		const name = STORED_AS[given.toLowerCase()] ?? given;
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const date = sinceByName.get(given.toLowerCase()) ?? sinceByName.get(name.toLowerCase());
		const year = date?.match(/^(?:19|20)\d{2}/)?.[0];
		companies.push({
			name,
			category: [
				...(entry.sectors ?? []).map(tag),
				year ? `Invested ${year}` : '',
				exited.has(given.toLowerCase()) ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: sites.get(given.toLowerCase()) ?? PAGE_URL
		});
	}

	return companies;
}
