import type { ScrapedCompany } from './types';

const PAGE_URL = 'https://www.ascension.vc/portfolio';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// next.js: the portfolio page is a wall of logos its script draws from a
// list of companies served in the page's payload, each with its name, its
// sectors ("FinTech", "DeepTech/AI"), the fund it came from ("2015
// Vintage"), its site and whether the fund is out of it. the sectors and
// the fund are kept as tags. a company the list marks to be hidden is left
// out, as are the ones named only "Stealth".

const LIST = '"companies":[';
const STEALTH = /^stealth\b/i;

interface Company {
	name?: string;
	sector?: string[];
	fund?: string[];
	website?: string;
	website_status?: string;
	is_exited?: boolean;
	hide_from_website?: boolean;
}

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/\s*,\s*/g, ' / ');

// the page's payload, pushed to the page's script in pieces
function flightPayload(html: string): string {
	const chunks: string[] = [];
	for (const push of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
		try {
			chunks.push(JSON.parse(push[1]));
		} catch {
			// a chunk that will not parse is one the page never used either
		}
	}
	return chunks.join('');
}

// the json array that opens at start, up to its closing bracket
function arrayAt(payload: string, start: number): string {
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let i = start; i < payload.length; i++) {
		const c = payload[i];
		if (escaped) escaped = false;
		else if (c === '\\') escaped = true;
		else if (c === '"') inString = !inString;
		else if (!inString) {
			if (c === '[') depth++;
			else if (c === ']' && --depth === 0) return payload.slice(start, i + 1);
		}
	}
	return '';
}

export async function scrape(): Promise<ScrapedCompany[]> {
	const resp = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
	if (!resp.ok) {
		throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
	}
	const payload = flightPayload(await resp.text());
	const at = payload.indexOf(LIST);
	const list = at < 0 ? '' : arrayAt(payload, at + LIST.length - 1);
	if (!list) {
		throw new Error('ascension: no list of companies in the page');
	}

	const companies: ScrapedCompany[] = [];
	const seen = new Set<string>();
	for (const company of JSON.parse(list) as Company[]) {
		const name = (company.name ?? '').replace(/\s+/g, ' ').trim();
		if (!name || company.hide_from_website || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const exited = company.is_exited === true || /^exit/i.test(company.website_status ?? '');
		const site = (company.website ?? '').trim();
		companies.push({
			name,
			category: [...(company.sector ?? []), ...(company.fund ?? []), exited ? 'Exited' : '']
				.map(tag)
				.filter((t, i, all) => t && all.indexOf(t) === i)
				.join(', '),
			url: /^https?:\/\//i.test(site) ? site : PAGE_URL
		});
	}
	if (companies.length === 0) {
		throw new Error('ascension: no companies in the list');
	}

	return companies;
}
