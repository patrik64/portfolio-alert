import type { ScrapedCompany } from './types';

const BASE_URL = 'https://www.dawncapital.com';
const PAGE_URL = `${BASE_URL}/companies`;
// the company pages are asked for one at a time, a pause between them
const PACE_MS = 150;
const REFUSED_MS = 20_000;
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js on sanity: the companies page hands its grid a list of records in
// the payload it streams to the browser — each company's name, its page
// here, its sectors and whether the fund has exited it. a company's own page
// adds what the grid leaves out: its site, and a list of facts — the years
// it was founded and the fund invested, its headquarters, one city or
// several ("London, New York") — and, on an exit, a strapline saying how it
// went ("Enterprise automation. Acquired by Sirion"), the buyer kept with
// the Exited tag. the sectors, the cities and the years are kept as tags. a
// company page that will not load leaves its company with what the grid
// said, linking that page.

const FLIGHT = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
const RECORD = '{"_id":"company-';
const META = '"meta":[{"label"';
const STRAPLINE = /"strapline":"((?:[^"\\]|\\.)*)"/;
const BUYER = /\bacquired by ([^.,;()]+?)\s*(?=[.,;()]|$)/i;
const UNSAID = /^(?:-|other|others|all|n\/a)$/i;
const STEALTH = /^stealth\b/i;

interface Listed {
	name?: string;
	href?: string;
	exited?: boolean;
	sectors?: { title?: string }[];
}

interface Fact {
	label?: string;
	value?: string | number;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => clean(s).replace(/\s*,\s*/g, ' / ');

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// the payload the page streams, its pieces joined
function payloadOf(html: string): string {
	const chunks: string[] = [];
	for (const [, chunk] of html.matchAll(FLIGHT)) {
		try {
			chunks.push(JSON.parse(chunk));
		} catch {
			// a piece that will not parse is one the page never used either
		}
	}
	return chunks.join('');
}

// the json value opening at start — an object or an array — up to its close
function jsonAt(text: string, start: number): unknown {
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let i = start; i < text.length; i++) {
		const c = text[i];
		if (escaped) escaped = false;
		else if (c === '\\') escaped = true;
		else if (c === '"') inString = !inString;
		else if (!inString) {
			if (c === '{' || c === '[') depth++;
			else if ((c === '}' || c === ']') && --depth === 0) {
				try {
					return JSON.parse(text.slice(start, i + 1));
				} catch {
					return undefined;
				}
			}
		}
	}
	return undefined;
}

interface Page {
	site: string;
	facts: Map<string, string>;
	strapline: string;
}

// what a company's page says, or nothing when it will not load; a refusal
// is waited out once
async function pageOf(href: string): Promise<Page | null> {
	try {
		let resp = await fetch(`${BASE_URL}${href}`, { headers: { 'User-Agent': UA } });
		if (resp.status === 429) {
			await resp.body?.cancel();
			await wait(REFUSED_MS);
			resp = await fetch(`${BASE_URL}${href}`, { headers: { 'User-Agent': UA } });
		}
		if (!resp.ok) return null;
		const payload = payloadOf(await resp.text());
		const at = payload.indexOf(META);
		const facts = new Map<string, string>();
		if (at >= 0) {
			const list = jsonAt(payload, at + '"meta":'.length);
			for (const fact of Array.isArray(list) ? (list as Fact[]) : []) {
				if (fact.label && fact.value != null) facts.set(clean(fact.label).toLowerCase(), clean(String(fact.value)));
			}
		}
		const site = payload.match(new RegExp(`"uri":"${href.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}","url":"(https?://[^"]+)"`))?.[1] ?? '';
		const strapline = payload.match(STRAPLINE)?.[1] ?? '';
		return { site, facts, strapline: strapline ? clean(JSON.parse(`"${strapline}"`)) : '' };
	} catch {
		return null;
	}
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const payload = payloadOf(await resp.text());

	// the grid's records, once each
	const listed = new Map<string, Listed>();
	for (let at = payload.indexOf(RECORD); at >= 0; at = payload.indexOf(RECORD, at + RECORD.length)) {
		const record = jsonAt(payload, at) as Listed | undefined;
		const name = clean(record?.name ?? '');
		if (record?.href && name && !listed.has(name.toLowerCase())) listed.set(name.toLowerCase(), record);
	}
	if (listed.size === 0) {
		throw new Error("dawn: no companies in the page's payload — the page moved");
	}

	const companies: ScrapedCompany[] = [];
	let withSite = 0;
	for (const [i, record] of [...listed.values()].entries()) {
		const name = clean(record.name ?? '');
		if (STEALTH.test(name)) continue;
		if (i > 0) await wait(PACE_MS);
		const page = await pageOf(record.href!);
		if (page?.site) withSite++;

		const sectors = (record.sectors ?? []).map((s) => tag(s.title ?? ''));
		const fact = (label: string) => page?.facts.get(label) ?? '';
		const cities = (fact('hqs') || fact('hq'))
			.split(/\s*,\s*/)
			.map(tag)
			.filter(Boolean);
		const year = (label: string) => fact(label).match(/\b(?:19|20)\d{2}\b/)?.[0];
		const out = record.exited === true || /^exited$/i.test(fact('status'));
		const buyer = out ? (page?.strapline.match(BUYER)?.[1] ?? '') : '';

		companies.push({
			name,
			category: [
				...(sectors.length ? sectors : [tag(fact('sector'))]).filter((s) => !UNSAID.test(s)),
				...cities,
				year('founded') ? `Founded ${year('founded')}` : '',
				year('invested') ? `Invested ${year('invested')}` : '',
				buyer ? `Acquired by ${tag(buyer)}` : '',
				out ? 'Exited' : ''
			]
				.filter((t, k, all) => t && all.indexOf(t) === k)
				.join(', '),
			url: page?.site || `${BASE_URL}${record.href}`
		});
	}

	if (companies.length === 0) {
		throw new Error('dawn: no companies on the companies page');
	}
	// without the company pages every company would come in bare
	if (withSite === 0) {
		throw new Error("dawn: no company page gave its site — the pages' payload moved");
	}

	return companies;
}
