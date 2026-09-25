import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://fin.capital/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
// the share of the page's logo cards the payload's records must reach
const MIN_SHARE = 0.9;

// next.js, rendered on the server: the page draws a logo card per company,
// naming it only in the logo's alt text, with a panel behind it. the
// companies themselves arrive as records in the flight payload the page
// ships for the browser — the name, the site, the thesis the fund files the
// company under ("Payments", "DeepTech"), the funds that hold it ("Flagship
// I, Horizons II") and whether it is active or exited — and those are read.
// the cards are counted against them, so a payload that stops carrying the
// list fails the fetch rather than emptying the fund.

const FLIGHT = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
const LIST = '"companies":[';
const CARD = /alt="[^"]* logo"/g;
const STEALTH = /^stealth\b/i;

interface Record {
	name?: string;
	website?: string;
	thesis?: string;
	status?: string;
	fund?: string;
}

const unescape = (s: string) =>
	s
		.replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&');

const clean = (s: string) => unescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

// the json array that follows a key in the payload's text, found by walking
// its brackets, since the text around it is not json as a whole
function arrayAfter(text: string, key: string): unknown[] {
	const start = text.indexOf(key);
	if (start < 0) return [];
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let i = start + key.length - 1; i < text.length; i++) {
		const ch = text[i];
		if (inString) {
			if (escaped) escaped = false;
			else if (ch === '\\') escaped = true;
			else if (ch === '"') inString = false;
			continue;
		}
		if (ch === '"') inString = true;
		else if (ch === '[' || ch === '{') depth++;
		else if (ch === ']' || ch === '}') {
			depth--;
			if (depth === 0) return JSON.parse(text.slice(start + key.length - 1, i + 1)) as unknown[];
		}
	}
	return [];
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const html = await resp.text();

	// the payload comes in pieces, each a javascript string literal
	const text = [...html.matchAll(FLIGHT)].map((m) => JSON.parse(`"${m[1]}"`) as string).join('');
	const records = arrayAfter(text, LIST) as Record[];
	const cards = (html.match(CARD) ?? []).length;
	if (records.length < cards * MIN_SHARE) {
		throw new Error(`fincapital: the payload carries ${records.length} companies for ${cards} cards on the page`);
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const record of records) {
		const name = clean(record.name ?? '');
		if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const status = clean(record.status ?? '');
		const exited = /^exit/i.test(status);
		companies.push({
			name,
			category: [
				tag(record.thesis ?? ''),
				...clean(record.fund ?? '')
					.split(/\s*,\s*/)
					.filter(Boolean),
				exited || /^active$/i.test(status) ? '' : status,
				exited ? 'Exited' : ''
			]
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: clean(record.website ?? '')
		});
	}

	if (companies.length === 0) {
		throw new Error('fincapital: the page carries no companies');
	}

	return companies;
}
